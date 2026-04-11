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

const BUSINESS_SLOT_COUNT = 6
const MANAGER_SLOT_INDEX = 0

type LeaderboardEntry = {
  ownerUserId: string
  businessName: string
  businessDescription: string
  capital: string
  ownerUsername: string | null
  ownerDisplayName: string | null
  managerUserId: string | null
  managerUsername: string | null
  managerDisplayName: string | null
  staffCount: number
  openSlots: number
  pendingRequest: boolean
  canRequestJoin: boolean
}

async function resolveBusinessAccess(userId: string) {
  const { rows: ownedRows } = await sql<{ owner_user_id: string }>`
    select owner_user_id
    from businesses
    where owner_user_id = ${userId}
    limit 1;
  `

  if (ownedRows[0]?.owner_user_id) {
    return {
      ownsBusiness: true,
      employedOwnerUserId: null as string | null,
    }
  }

  const { rows: employedRows } = await sql<{ owner_user_id: string }>`
    select owner_user_id
    from business_staff
    where employee_user_id = ${userId}
    limit 1;
  `

  return {
    ownsBusiness: false,
    employedOwnerUserId: employedRows[0]?.owner_user_id ?? null,
  }
}

async function loadLeaderboard(userId: string): Promise<LeaderboardEntry[]> {
  await ensureUser(userId)

  const access = await resolveBusinessAccess(userId)

  const { rows } = await sql<{
    owner_user_id: string
    business_name: string
    business_description: string
    capital: string
    owner_username: string | null
    owner_display_name: string | null
    manager_user_id: string | null
    manager_username: string | null
    manager_display_name: string | null
    staff_count: number
    open_slots: number
    pending_request: boolean
  }>`
    select
      b.owner_user_id,
      b.name as business_name,
      b.description as business_description,
      b.capital::text as capital,
      owner.username as owner_username,
      owner.display_name as owner_display_name,
      manager_slot.employee_user_id as manager_user_id,
      manager_user.username as manager_username,
      manager_user.display_name as manager_display_name,
      count(staff.employee_user_id)::int as staff_count,
      (${BUSINESS_SLOT_COUNT} - count(staff.employee_user_id)::int) as open_slots,
      exists(
        select 1
        from business_join_requests req
        where req.owner_user_id = b.owner_user_id
          and req.requester_user_id = ${userId}
          and req.status = 'pending'
      ) as pending_request
    from businesses b
    left join users owner on owner.tg_user_id = b.owner_user_id
    left join business_staff manager_slot
      on manager_slot.owner_user_id = b.owner_user_id
     and manager_slot.slot_index = ${MANAGER_SLOT_INDEX}
    left join users manager_user on manager_user.tg_user_id = manager_slot.employee_user_id
    left join business_staff staff
      on staff.owner_user_id = b.owner_user_id
     and staff.employee_user_id is not null
    group by
      b.owner_user_id,
      b.name,
      b.description,
      b.capital,
      owner.username,
      owner.display_name,
      manager_slot.employee_user_id,
      manager_user.username,
      manager_user.display_name
    order by b.capital desc, b.updated_at desc, b.name asc;
  `

  return rows.map((row) => {
    const canRequestJoin =
      !access.ownsBusiness &&
      !access.employedOwnerUserId &&
      row.owner_user_id !== userId &&
      row.open_slots > 0

    return {
      ownerUserId: row.owner_user_id,
      businessName: row.business_name,
      businessDescription: row.business_description,
      capital: row.capital,
      ownerUsername: row.owner_username,
      ownerDisplayName: row.owner_display_name,
      managerUserId: row.manager_user_id,
      managerUsername: row.manager_username,
      managerDisplayName: row.manager_display_name,
      staffCount: row.staff_count,
      openSlots: row.open_slots,
      pendingRequest: row.pending_request,
      canRequestJoin,
    }
  })
}

export default async function handler(req: NodeApiRequest, res: NodeApiResponse): Promise<void> {
  await ensureSchema()

  if (req.method === 'GET') {
    const userId = getQueryParam(req, 'userId')
    if (!userId) {
      sendJson(res, { error: 'userId is required' }, 400)
      return
    }

    sendJson(res, { items: await loadLeaderboard(userId) })
    return
  }

  if (req.method !== 'POST') {
    sendText(res, 'Method Not Allowed', 405)
    return
  }

  const body = await readJsonBody<
    | { action?: 'request_join'; userId?: string; ownerUserId?: string }
    | null
  >(req)

  const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  const ownerUserId = typeof body?.ownerUserId === 'string' ? body.ownerUserId.trim() : ''

  if (body?.action !== 'request_join' || !userId || !ownerUserId) {
    sendJson(res, { error: 'action, userId and ownerUserId are required' }, 400)
    return
  }

  if (userId === ownerUserId) {
    sendJson(res, { error: 'Нельзя отправить заявку в свой бизнес' }, 400)
    return
  }

  await ensureUser(userId)

  const access = await resolveBusinessAccess(userId)
  if (access.ownsBusiness || access.employedOwnerUserId) {
    sendJson(res, { error: 'Сначала закройте или покиньте текущий бизнес' }, 409)
    return
  }

  const { rows: businessRows } = await sql<{ owner_user_id: string }>`
    select owner_user_id
    from businesses
    where owner_user_id = ${ownerUserId}
    limit 1;
  `

  if (!businessRows[0]?.owner_user_id) {
    sendJson(res, { error: 'Бизнес не найден' }, 404)
    return
  }

  const { rows: openSlotRows } = await sql<{ slot_index: number }>`
    select slot_index
    from business_staff
    where owner_user_id = ${ownerUserId}
      and employee_user_id is null
    order by slot_index asc
    limit 1;
  `

  if (!openSlotRows[0]) {
    sendJson(res, { error: 'В этом бизнесе пока нет свободных мест' }, 409)
    return
  }

  const { rows: pendingRows } = await sql<{ id: number }>`
    select id
    from business_join_requests
    where owner_user_id = ${ownerUserId}
      and requester_user_id = ${userId}
      and status = 'pending'
    limit 1;
  `

  if (pendingRows[0]?.id) {
    sendJson(res, { error: 'Заявка уже отправлена' }, 409)
    return
  }

  await sql`
    insert into business_join_requests (
      owner_user_id,
      requester_user_id,
      status
    )
    values (
      ${ownerUserId},
      ${userId},
      'pending'
    );
  `

  sendJson(res, { ok: true, items: await loadLeaderboard(userId) })
}
