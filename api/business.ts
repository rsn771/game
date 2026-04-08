import { sql } from '@vercel/postgres'
import { ensureSchema, ensureUser } from './_lib/db.js'
import {
  getQueryParam,
  readJsonBody,
  sendJson,
  sendText,
  type NodeApiRequest,
  type NodeApiResponse,
} from './_lib/http.js'

export const config = {
  runtime: 'nodejs',
}

const BUSINESS_OPEN_COST = 100_000
const BUSINESS_START_CAPITAL = 80_000
const BUSINESS_SLOT_COUNT = 6
const DEFAULT_BUSINESS_ROLES = [
  'Управляющий',
  'Консультант',
  'Кассир',
  'Маркетолог',
  'Логист',
  'Ассистент',
] as const

type BusinessMode = 'none' | 'owner' | 'employee'

type BusinessProfile = {
  name: string
  description: string
  capital: string
}

type BusinessStaffMember = {
  slotIndex: number
  roleName: string
  userId: string | null
  username: string | null
  displayName: string | null
}

type BusinessPayload = {
  mode: BusinessMode
  business: BusinessProfile | null
  stars: string
  owner: { userId: string; username: string | null; displayName: string | null } | null
  staff: BusinessStaffMember[]
  assignment: { slotIndex: number; roleName: string } | null
}

function normalizeRequiredText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function defaultRoleName(slotIndex: number): string {
  return DEFAULT_BUSINESS_ROLES[slotIndex] ?? `Сотрудник ${slotIndex + 1}`
}

function createEmptyStaff(): BusinessStaffMember[] {
  return Array.from({ length: BUSINESS_SLOT_COUNT }, (_, slotIndex) => ({
    slotIndex,
    roleName: defaultRoleName(slotIndex),
    userId: null,
    username: null,
    displayName: null,
  }))
}

async function loadBusiness(userId: string) {
  const { rows } = await sql<{ name: string; description: string; capital: string }>`
    select name, description, capital::text as capital
    from businesses
    where owner_user_id = ${userId}
    limit 1;
  `
  return rows[0] ?? null
}

async function loadStars(userId: string) {
  const { rows } = await sql<{ stars: string }>`
    select stars::text as stars
    from users
    where tg_user_id = ${userId}
    limit 1;
  `
  return rows[0]?.stars ?? '0'
}

async function ensureBusinessStaffSlots(ownerUserId: string) {
  for (let slotIndex = 0; slotIndex < BUSINESS_SLOT_COUNT; slotIndex += 1) {
    await sql`
      insert into business_staff (owner_user_id, slot_index, role_name)
      values (${ownerUserId}, ${slotIndex}, ${defaultRoleName(slotIndex)})
      on conflict (owner_user_id, slot_index) do nothing;
    `
  }
}

async function loadBusinessStaff(ownerUserId: string) {
  await ensureBusinessStaffSlots(ownerUserId)

  const { rows } = await sql<{
    slot_index: number
    role_name: string
    employee_user_id: string | null
    username: string | null
    display_name: string | null
  }>`
    select
      bs.slot_index,
      bs.role_name,
      bs.employee_user_id,
      u.username,
      u.display_name
    from business_staff bs
    left join users u on u.tg_user_id = bs.employee_user_id
    where bs.owner_user_id = ${ownerUserId}
    order by bs.slot_index asc;
  `

  const byIndex = new Map(rows.map((row) => [row.slot_index, row]))

  return createEmptyStaff().map((slot) => {
    const row = byIndex.get(slot.slotIndex)
    if (!row) return slot
    return {
      slotIndex: slot.slotIndex,
      roleName: row.role_name || defaultRoleName(slot.slotIndex),
      userId: row.employee_user_id,
      username: row.username,
      displayName: row.display_name,
    }
  })
}

async function loadEmployment(userId: string) {
  const { rows } = await sql<{
    owner_user_id: string
    name: string
    description: string
    capital: string
    slot_index: number
    role_name: string
    owner_username: string | null
    owner_display_name: string | null
  }>`
    select
      b.owner_user_id,
      b.name,
      b.description,
      b.capital::text as capital,
      bs.slot_index,
      bs.role_name,
      owner.username as owner_username,
      owner.display_name as owner_display_name
    from business_staff bs
    join businesses b on b.owner_user_id = bs.owner_user_id
    left join users owner on owner.tg_user_id = b.owner_user_id
    where bs.employee_user_id = ${userId}
    limit 1;
  `

  return rows[0] ?? null
}

async function buildBusinessPayload(userId: string): Promise<BusinessPayload> {
  await ensureUser(userId)
  const stars = await loadStars(userId)

  const ownedBusiness = await loadBusiness(userId)
  if (ownedBusiness) {
    return {
      mode: 'owner',
      business: ownedBusiness,
      stars,
      owner: {
        userId,
        username: null,
        displayName: null,
      },
      staff: await loadBusinessStaff(userId),
      assignment: null,
    }
  }

  const employment = await loadEmployment(userId)
  if (employment) {
    return {
      mode: 'employee',
      business: {
        name: employment.name,
        description: employment.description,
        capital: employment.capital,
      },
      stars,
      owner: {
        userId: employment.owner_user_id,
        username: employment.owner_username,
        displayName: employment.owner_display_name,
      },
      staff: await loadBusinessStaff(employment.owner_user_id),
      assignment: {
        slotIndex: employment.slot_index,
        roleName: employment.role_name,
      },
    }
  }

  return {
    mode: 'none',
    business: null,
    stars,
    owner: null,
    staff: createEmptyStaff(),
    assignment: null,
  }
}

export default async function handler(req: NodeApiRequest, res: NodeApiResponse): Promise<void> {
  await ensureSchema()

  if (req.method === 'GET') {
    const userId = getQueryParam(req, 'userId')
    if (!userId) {
      sendJson(res, { error: 'userId is required' }, 400)
      return
    }

    sendJson(res, await buildBusinessPayload(userId))
    return
  }

  if (req.method === 'POST') {
    const body = await readJsonBody<
      | { userId?: string; name?: string; description?: string; restore?: boolean }
      | null
    >(req)
    const userId = body?.userId
    if (!userId) {
      sendJson(res, { error: 'userId is required' }, 400)
      return
    }

    await ensureUser(userId)

    const existing = await loadBusiness(userId)
    const isRestore = body?.restore === true
    if (existing) {
      if (isRestore) {
        sendJson(res, { ok: true, ...(await buildBusinessPayload(userId)) })
        return
      }

      sendJson(res, { error: 'Бизнес уже открыт' }, 409)
      return
    }

    const name = normalizeRequiredText(body?.name, 'Мой бизнес')
    const description = normalizeRequiredText(body?.description, 'Описание бизнеса появится позже.')

    if (isRestore) {
      await sql`
        insert into businesses (owner_user_id, name, description, capital)
        values (${userId}, ${name}, ${description}, ${BUSINESS_START_CAPITAL});
      `
      await ensureBusinessStaffSlots(userId)
      sendJson(res, { ok: true, ...(await buildBusinessPayload(userId)) })
      return
    }

    const { rows: starRows } = await sql<{ stars: string }>`
      update users
      set stars = stars - ${BUSINESS_OPEN_COST},
          updated_at = now()
      where tg_user_id = ${userId}
        and stars >= ${BUSINESS_OPEN_COST}
      returning stars::text as stars;
    `

    if (!starRows[0]?.stars) {
      sendJson(res, { error: 'Недостаточно звёзд для открытия бизнеса' }, 400)
      return
    }

    await sql`
      insert into businesses (owner_user_id, name, description, capital)
      values (${userId}, ${name}, ${description}, ${BUSINESS_START_CAPITAL});
    `
    await ensureBusinessStaffSlots(userId)

    sendJson(res, { ok: true, ...(await buildBusinessPayload(userId)) })
    return
  }

  if (req.method === 'PATCH') {
    const body = await readJsonBody<
      | {
          action?: 'profile' | 'staff'
          userId?: string
          name?: string
          description?: string
          slotIndex?: number
          employeeUserId?: string | null
          roleName?: string
        }
      | null
    >(req)

    const userId = body?.userId
    if (!userId) {
      sendJson(res, { error: 'userId is required' }, 400)
      return
    }

    await ensureUser(userId)

    const action = body?.action ?? 'profile'
    const existing = await loadBusiness(userId)
    if (!existing) {
      sendJson(res, { error: 'Бизнес ещё не открыт' }, 404)
      return
    }

    if (action === 'staff') {
      const slotIndex = Number(body?.slotIndex)
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= BUSINESS_SLOT_COUNT) {
        sendJson(res, { error: 'slotIndex is required' }, 400)
        return
      }

      const employeeUserId = typeof body?.employeeUserId === 'string' && body.employeeUserId.trim().length > 0
        ? body.employeeUserId.trim()
        : null

      if (employeeUserId === userId) {
        sendJson(res, { error: 'Нельзя назначить владельца сотрудником' }, 400)
        return
      }

      if (employeeUserId) {
        await ensureUser(employeeUserId)
        const { rows: takenRows } = await sql<{ owner_user_id: string; slot_index: number }>`
          select owner_user_id, slot_index
          from business_staff
          where employee_user_id = ${employeeUserId}
          limit 1;
        `

        const taken = takenRows[0]
        if (taken && (taken.owner_user_id !== userId || taken.slot_index !== slotIndex)) {
          sendJson(res, { error: 'Этот пользователь уже работает в другом бизнесе' }, 409)
          return
        }
      }

      await ensureBusinessStaffSlots(userId)
      const roleName = normalizeRequiredText(body?.roleName, defaultRoleName(slotIndex))

      await sql`
        update business_staff
        set employee_user_id = ${employeeUserId},
            role_name = ${roleName},
            updated_at = now()
        where owner_user_id = ${userId}
          and slot_index = ${slotIndex};
      `

      sendJson(res, { ok: true, ...(await buildBusinessPayload(userId)) })
      return
    }

    const name = normalizeRequiredText(body?.name, existing.name)
    const description = normalizeRequiredText(
      body?.description,
      existing.description || 'Описание бизнеса появится позже.',
    )

    await sql`
      update businesses
      set name = ${name},
          description = ${description},
          updated_at = now()
      where owner_user_id = ${userId};
    `

    sendJson(res, { ok: true, ...(await buildBusinessPayload(userId)) })
    return
  }

  sendText(res, 'Method Not Allowed', 405)
}
