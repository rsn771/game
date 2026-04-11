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
const MANAGER_SLOT_INDEX = 0
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

type BusinessPendingInvite = {
  inviteId: number
  slotIndex: number
  roleName: string
  targetUserId: string
  username: string | null
  displayName: string | null
  senderUserId: string
  senderUsername: string | null
  senderDisplayName: string | null
}

type BusinessPayload = {
  mode: BusinessMode
  business: BusinessProfile | null
  stars: string
  owner: { userId: string; username: string | null; displayName: string | null } | null
  staff: BusinessStaffMember[]
  assignment: { slotIndex: number; roleName: string } | null
  permissions: { canManageStaff: boolean; canEditBusiness: boolean }
  pendingInvites: BusinessPendingInvite[]
}

type EmploymentRow = {
  owner_user_id: string
  name: string
  description: string
  capital: string
  slot_index: number
  role_name: string
  owner_username: string | null
  owner_display_name: string | null
}

type BusinessActorContext = {
  ownerUserId: string
  isOwner: boolean
  canManageStaff: boolean
  canEditBusiness: boolean
  assignment: { slotIndex: number; roleName: string } | null
  business: BusinessProfile
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

async function loadEmployment(userId: string): Promise<EmploymentRow | null> {
  const { rows } = await sql<EmploymentRow>`
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

async function loadPendingInvites(ownerUserId: string): Promise<BusinessPendingInvite[]> {
  const { rows } = await sql<{
    id: number
    slot_index: number
    role_name: string
    target_user_id: string
    username: string | null
    display_name: string | null
    sender_user_id: string
    sender_username: string | null
    sender_display_name: string | null
  }>`
    select
      bi.id,
      bi.slot_index,
      bi.role_name,
      bi.target_user_id,
      target.username,
      target.display_name,
      bi.sender_user_id,
      sender.username as sender_username,
      sender.display_name as sender_display_name
    from business_invites bi
    left join users target on target.tg_user_id = bi.target_user_id
    left join users sender on sender.tg_user_id = bi.sender_user_id
    where bi.owner_user_id = ${ownerUserId}
      and bi.status = 'pending'
    order by bi.slot_index asc, bi.updated_at desc;
  `

  return rows.map((row) => ({
    inviteId: row.id,
    slotIndex: row.slot_index,
    roleName: row.role_name,
    targetUserId: row.target_user_id,
    username: row.username,
    displayName: row.display_name,
    senderUserId: row.sender_user_id,
    senderUsername: row.sender_username,
    senderDisplayName: row.sender_display_name,
  }))
}

async function loadActorContext(userId: string): Promise<BusinessActorContext | null> {
  const ownedBusiness = await loadBusiness(userId)
  if (ownedBusiness) {
    return {
      ownerUserId: userId,
      isOwner: true,
      canManageStaff: true,
      canEditBusiness: true,
      assignment: null,
      business: ownedBusiness,
    }
  }

  const employment = await loadEmployment(userId)
  if (!employment) return null

  return {
    ownerUserId: employment.owner_user_id,
    isOwner: false,
    canManageStaff: employment.slot_index === MANAGER_SLOT_INDEX,
    canEditBusiness: false,
    assignment: {
      slotIndex: employment.slot_index,
      roleName: employment.role_name,
    },
    business: {
      name: employment.name,
      description: employment.description,
      capital: employment.capital,
    },
  }
}

async function hasAcceptedFriendship(userId: string, targetUserId: string) {
  const { rows } = await sql<{ ok: number }>`
    select 1 as ok
    from friend_requests
    where (
      (from_user_id = ${userId} and to_user_id = ${targetUserId})
      or
      (from_user_id = ${targetUserId} and to_user_id = ${userId})
    )
      and status = 'accepted'
    limit 1;
  `

  return Boolean(rows[0]?.ok)
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
      permissions: {
        canManageStaff: true,
        canEditBusiness: true,
      },
      pendingInvites: await loadPendingInvites(userId),
    }
  }

  const employment = await loadEmployment(userId)
  if (employment) {
    const canManageStaff = employment.slot_index === MANAGER_SLOT_INDEX
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
      permissions: {
        canManageStaff,
        canEditBusiness: false,
      },
      pendingInvites: canManageStaff ? await loadPendingInvites(employment.owner_user_id) : [],
    }
  }

  return {
    mode: 'none',
    business: null,
    stars,
    owner: null,
    staff: createEmptyStaff(),
    assignment: null,
    permissions: {
      canManageStaff: false,
      canEditBusiness: false,
    },
    pendingInvites: [],
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
          action?: 'profile' | 'update_role' | 'remove_staff' | 'invite' | 'cancel_invite' | 'leave'
          userId?: string
          name?: string
          description?: string
          slotIndex?: number
          targetUserId?: string | null
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

    if (action === 'leave') {
      const employment = await loadEmployment(userId)
      if (!employment) {
        sendJson(res, { error: 'Вы не работаете в бизнесе' }, 404)
        return
      }

      await sql`
        update business_staff
        set employee_user_id = null,
            updated_at = now()
        where owner_user_id = ${employment.owner_user_id}
          and slot_index = ${employment.slot_index}
          and employee_user_id = ${userId};
      `

      sendJson(res, { ok: true, ...(await buildBusinessPayload(userId)) })
      return
    }

    const context = await loadActorContext(userId)
    if (!context) {
      sendJson(res, { error: 'Бизнес ещё не открыт' }, 404)
      return
    }

    if (action === 'profile') {
      if (!context.canEditBusiness) {
        sendJson(res, { error: 'Только владелец может менять профиль бизнеса' }, 403)
        return
      }

      const name = normalizeRequiredText(body?.name, context.business.name)
      const description = normalizeRequiredText(
        body?.description,
        context.business.description || 'Описание бизнеса появится позже.',
      )

      await sql`
        update businesses
        set name = ${name},
            description = ${description},
            updated_at = now()
        where owner_user_id = ${context.ownerUserId};
      `

      sendJson(res, { ok: true, ...(await buildBusinessPayload(userId)) })
      return
    }

    if (!context.canManageStaff) {
      sendJson(res, { error: 'Недостаточно прав для управления сотрудниками' }, 403)
      return
    }

    const slotIndex = Number(body?.slotIndex)
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= BUSINESS_SLOT_COUNT) {
      sendJson(res, { error: 'slotIndex is required' }, 400)
      return
    }

    const roleName = normalizeRequiredText(body?.roleName, defaultRoleName(slotIndex))
    await ensureBusinessStaffSlots(context.ownerUserId)

    if (action === 'update_role') {
      await sql`
        update business_staff
        set role_name = ${roleName},
            updated_at = now()
        where owner_user_id = ${context.ownerUserId}
          and slot_index = ${slotIndex};
      `

      await sql`
        update business_invites
        set role_name = ${roleName},
            updated_at = now()
        where owner_user_id = ${context.ownerUserId}
          and slot_index = ${slotIndex}
          and status = 'pending';
      `

      sendJson(res, { ok: true, ...(await buildBusinessPayload(userId)) })
      return
    }

    if (action === 'remove_staff') {
      await sql`
        update business_staff
        set employee_user_id = null,
            updated_at = now()
        where owner_user_id = ${context.ownerUserId}
          and slot_index = ${slotIndex};
      `

      await sql`
        update business_invites
        set status = 'cancelled',
            updated_at = now()
        where owner_user_id = ${context.ownerUserId}
          and slot_index = ${slotIndex}
          and status = 'pending';
      `

      sendJson(res, { ok: true, ...(await buildBusinessPayload(userId)) })
      return
    }

    if (action === 'cancel_invite') {
      await sql`
        update business_invites
        set status = 'cancelled',
            updated_at = now()
        where owner_user_id = ${context.ownerUserId}
          and slot_index = ${slotIndex}
          and status = 'pending';
      `

      sendJson(res, { ok: true, ...(await buildBusinessPayload(userId)) })
      return
    }

    if (action === 'invite') {
      const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId.trim() : ''
      if (!targetUserId) {
        sendJson(res, { error: 'targetUserId is required' }, 400)
        return
      }

      if (targetUserId === context.ownerUserId || targetUserId === userId) {
        sendJson(res, { error: 'Нельзя отправить приглашение самому себе' }, 400)
        return
      }

      await ensureUser(targetUserId)

      if (!await hasAcceptedFriendship(userId, targetUserId)) {
        sendJson(res, { error: 'Приглашать можно только друзей' }, 403)
        return
      }

      const { rows: slotRows } = await sql<{ employee_user_id: string | null }>`
        select employee_user_id
        from business_staff
        where owner_user_id = ${context.ownerUserId}
          and slot_index = ${slotIndex}
        limit 1;
      `

      if (slotRows[0]?.employee_user_id) {
        sendJson(res, { error: 'Этот слот уже занят сотрудником' }, 409)
        return
      }

      const { rows: pendingSlotRows } = await sql<{ id: number }>`
        select id
        from business_invites
        where owner_user_id = ${context.ownerUserId}
          and slot_index = ${slotIndex}
          and status = 'pending'
        limit 1;
      `

      if (pendingSlotRows[0]?.id) {
        sendJson(res, { error: 'По этому слоту уже ждёт ответ на приглашение' }, 409)
        return
      }

      const { rows: employedRows } = await sql<{ owner_user_id: string }>`
        select owner_user_id
        from business_staff
        where employee_user_id = ${targetUserId}
        limit 1;
      `

      if (employedRows[0]?.owner_user_id) {
        sendJson(res, { error: 'Этот пользователь уже работает в другом бизнесе' }, 409)
        return
      }

      const { rows: pendingTargetRows } = await sql<{ id: number }>`
        select id
        from business_invites
        where target_user_id = ${targetUserId}
          and status = 'pending'
        limit 1;
      `

      if (pendingTargetRows[0]?.id) {
        sendJson(res, { error: 'У пользователя уже есть активное приглашение в бизнес' }, 409)
        return
      }

      await sql`
        insert into business_invites (
          owner_user_id,
          sender_user_id,
          slot_index,
          target_user_id,
          role_name,
          status
        )
        values (
          ${context.ownerUserId},
          ${userId},
          ${slotIndex},
          ${targetUserId},
          ${roleName},
          'pending'
        );
      `

      sendJson(res, { ok: true, ...(await buildBusinessPayload(userId)) })
      return
    }

    sendJson(res, { error: 'Unsupported action' }, 400)
    return
  }

  sendText(res, 'Method Not Allowed', 405)
}
