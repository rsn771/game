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

const MANAGER_SLOT_INDEX = 0

type BusinessInviteMail = {
  type: 'invite'
  inviteId: number
  ownerUserId: string
  businessName: string
  businessDescription: string
  capital: string
  slotIndex: number
  roleName: string
  ownerUsername: string | null
  ownerDisplayName: string | null
  senderUserId: string
  senderUsername: string | null
  senderDisplayName: string | null
  updatedAt: string
}

type BusinessJoinRequestMail = {
  type: 'join_request'
  requestId: number
  ownerUserId: string
  businessName: string
  businessDescription: string
  capital: string
  requesterUserId: string
  requesterUsername: string | null
  requesterDisplayName: string | null
  openSlots: number
  updatedAt: string
}

type MailEntry = BusinessInviteMail | BusinessJoinRequestMail

async function loadManagedOwnerIds(userId: string): Promise<string[]> {
  const ownerIds = new Set<string>()

  const { rows: ownedRows } = await sql<{ owner_user_id: string }>`
    select owner_user_id
    from businesses
    where owner_user_id = ${userId};
  `

  for (const row of ownedRows) {
    ownerIds.add(row.owner_user_id)
  }

  const { rows: managerRows } = await sql<{ owner_user_id: string }>`
    select owner_user_id
    from business_staff
    where employee_user_id = ${userId}
      and slot_index = ${MANAGER_SLOT_INDEX};
  `

  for (const row of managerRows) {
    ownerIds.add(row.owner_user_id)
  }

  return [...ownerIds]
}

async function loadInviteMail(userId: string): Promise<BusinessInviteMail[]> {
  const { rows } = await sql<{
    invite_id: number
    owner_user_id: string
    business_name: string
    business_description: string
    capital: string
    slot_index: number
    role_name: string
    owner_username: string | null
    owner_display_name: string | null
    sender_user_id: string
    sender_username: string | null
    sender_display_name: string | null
    updated_at: string
  }>`
    select
      bi.id as invite_id,
      bi.owner_user_id,
      b.name as business_name,
      b.description as business_description,
      b.capital::text as capital,
      bi.slot_index,
      bi.role_name,
      owner.username as owner_username,
      owner.display_name as owner_display_name,
      bi.sender_user_id,
      sender.username as sender_username,
      sender.display_name as sender_display_name,
      bi.updated_at::text as updated_at
    from business_invites bi
    join businesses b on b.owner_user_id = bi.owner_user_id
    left join users owner on owner.tg_user_id = bi.owner_user_id
    left join users sender on sender.tg_user_id = bi.sender_user_id
    where bi.target_user_id = ${userId}
      and bi.status = 'pending'
    order by bi.updated_at desc;
  `

  return rows.map((row) => ({
    type: 'invite',
    inviteId: row.invite_id,
    ownerUserId: row.owner_user_id,
    businessName: row.business_name,
    businessDescription: row.business_description,
    capital: row.capital,
    slotIndex: row.slot_index,
    roleName: row.role_name,
    ownerUsername: row.owner_username,
    ownerDisplayName: row.owner_display_name,
    senderUserId: row.sender_user_id,
    senderUsername: row.sender_username,
    senderDisplayName: row.sender_display_name,
    updatedAt: row.updated_at,
  }))
}

async function loadJoinRequestMail(userId: string): Promise<BusinessJoinRequestMail[]> {
  const managedOwnerIds = await loadManagedOwnerIds(userId)
  if (managedOwnerIds.length === 0) return []

  const result = await Promise.all(
    managedOwnerIds.map(async (ownerUserId) => {
      const { rows } = await sql<{
        request_id: number
        owner_user_id: string
        business_name: string
        business_description: string
        capital: string
        requester_user_id: string
        requester_username: string | null
        requester_display_name: string | null
        open_slots: number
        updated_at: string
      }>`
        select
          req.id as request_id,
          req.owner_user_id,
          b.name as business_name,
          b.description as business_description,
          b.capital::text as capital,
          req.requester_user_id,
          requester.username as requester_username,
          requester.display_name as requester_display_name,
          (
            select count(*)
            from business_staff free_slot
            where free_slot.owner_user_id = req.owner_user_id
              and free_slot.employee_user_id is null
          )::int as open_slots,
          req.updated_at::text as updated_at
        from business_join_requests req
        join businesses b on b.owner_user_id = req.owner_user_id
        left join users requester on requester.tg_user_id = req.requester_user_id
        where req.owner_user_id = ${ownerUserId}
          and req.status = 'pending'
        order by req.updated_at desc;
      `

      return rows.map((row) => ({
        type: 'join_request' as const,
        requestId: row.request_id,
        ownerUserId: row.owner_user_id,
        businessName: row.business_name,
        businessDescription: row.business_description,
        capital: row.capital,
        requesterUserId: row.requester_user_id,
        requesterUsername: row.requester_username,
        requesterDisplayName: row.requester_display_name,
        openSlots: row.open_slots,
        updatedAt: row.updated_at,
      }))
    }),
  )

  return result
    .flat()
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

async function loadInbox(userId: string): Promise<MailEntry[]> {
  const [invites, requests] = await Promise.all([
    loadInviteMail(userId),
    loadJoinRequestMail(userId),
  ])

  return [...invites, ...requests].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

async function canReviewJoinRequest(client: Awaited<ReturnType<typeof sql.connect>>, userId: string, ownerUserId: string) {
  if (userId === ownerUserId) return true

  const { rows } = await client.sql<{ owner_user_id: string }>`
    select owner_user_id
    from business_staff
    where owner_user_id = ${ownerUserId}
      and employee_user_id = ${userId}
      and slot_index = ${MANAGER_SLOT_INDEX}
    limit 1;
  `

  return Boolean(rows[0]?.owner_user_id)
}

async function respondToInvite(userId: string, inviteId: number, decision: 'accept' | 'decline', res: NodeApiResponse) {
  const client = await sql.connect()

  try {
    await client.query('begin')

    const { rows: inviteRows } = await client.sql<{
      id: number
      owner_user_id: string
      slot_index: number
      role_name: string
      target_user_id: string
    }>`
      select id, owner_user_id, slot_index, role_name, target_user_id
      from business_invites
      where id = ${inviteId}
        and target_user_id = ${userId}
        and status = 'pending'
      limit 1
      for update;
    `

    const invite = inviteRows[0]
    if (!invite) {
      await client.query('rollback')
      sendJson(res, { error: 'Приглашение не найдено' }, 404)
      return
    }

    if (decision === 'decline') {
      await client.sql`
        update business_invites
        set status = 'declined',
            updated_at = now()
        where id = ${inviteId};
      `

      await client.query('commit')
      sendJson(res, { ok: true, inbox: await loadInbox(userId) })
      return
    }

    const { rows: ownedRows } = await client.sql<{ owner_user_id: string }>`
      select owner_user_id
      from businesses
      where owner_user_id = ${userId}
      limit 1;
    `

    if (ownedRows[0]?.owner_user_id) {
      await client.query('rollback')
      sendJson(res, { error: 'Сначала закройте свой бизнес' }, 409)
      return
    }

    const { rows: employedRows } = await client.sql<{ owner_user_id: string }>`
      select owner_user_id
      from business_staff
      where employee_user_id = ${userId}
      limit 1;
    `

    if (employedRows[0]?.owner_user_id) {
      await client.query('rollback')
      sendJson(res, { error: 'Сначала выйдите из текущего бизнеса' }, 409)
      return
    }

    const { rows: slotRows } = await client.sql<{ employee_user_id: string | null }>`
      select employee_user_id
      from business_staff
      where owner_user_id = ${invite.owner_user_id}
        and slot_index = ${invite.slot_index}
      limit 1
      for update;
    `

    if (slotRows[0]?.employee_user_id) {
      await client.sql`
        update business_invites
        set status = 'cancelled',
            updated_at = now()
        where id = ${inviteId};
      `
      await client.query('commit')
      sendJson(res, { error: 'Слот уже занят, приглашение отменено', inbox: await loadInbox(userId) }, 409)
      return
    }

    await client.sql`
      update business_staff
      set employee_user_id = ${userId},
          role_name = ${invite.role_name},
          updated_at = now()
      where owner_user_id = ${invite.owner_user_id}
        and slot_index = ${invite.slot_index};
    `

    await client.sql`
      update business_invites
      set status = 'accepted',
          updated_at = now()
      where id = ${inviteId};
    `

    await client.sql`
      update business_invites
      set status = 'cancelled',
          updated_at = now()
      where target_user_id = ${userId}
        and status = 'pending'
        and id <> ${inviteId};
    `

    await client.sql`
      update business_join_requests
      set status = 'cancelled',
          updated_at = now()
      where requester_user_id = ${userId}
        and status = 'pending';
    `

    await client.query('commit')
    sendJson(res, { ok: true, inbox: await loadInbox(userId) })
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function respondToJoinRequest(userId: string, requestId: number, decision: 'accept' | 'decline', res: NodeApiResponse) {
  const client = await sql.connect()

  try {
    await client.query('begin')

    const { rows: requestRows } = await client.sql<{
      id: number
      owner_user_id: string
      requester_user_id: string
    }>`
      select id, owner_user_id, requester_user_id
      from business_join_requests
      where id = ${requestId}
        and status = 'pending'
      limit 1
      for update;
    `

    const request = requestRows[0]
    if (!request) {
      await client.query('rollback')
      sendJson(res, { error: 'Заявка не найдена' }, 404)
      return
    }

    if (!await canReviewJoinRequest(client, userId, request.owner_user_id)) {
      await client.query('rollback')
      sendJson(res, { error: 'Недостаточно прав для обработки заявки' }, 403)
      return
    }

    if (decision === 'decline') {
      await client.sql`
        update business_join_requests
        set status = 'declined',
            reviewed_by_user_id = ${userId},
            updated_at = now()
        where id = ${requestId};
      `

      await client.query('commit')
      sendJson(res, { ok: true, inbox: await loadInbox(userId) })
      return
    }

    const { rows: ownedRows } = await client.sql<{ owner_user_id: string }>`
      select owner_user_id
      from businesses
      where owner_user_id = ${request.requester_user_id}
      limit 1;
    `

    if (ownedRows[0]?.owner_user_id) {
      await client.query('rollback')
      sendJson(res, { error: 'У пользователя уже есть свой бизнес' }, 409)
      return
    }

    const { rows: employedRows } = await client.sql<{ owner_user_id: string }>`
      select owner_user_id
      from business_staff
      where employee_user_id = ${request.requester_user_id}
      limit 1;
    `

    if (employedRows[0]?.owner_user_id) {
      await client.query('rollback')
      sendJson(res, { error: 'Пользователь уже работает в другом бизнесе' }, 409)
      return
    }

    const { rows: freeSlotRows } = await client.sql<{ slot_index: number }>`
      select slot_index
      from business_staff
      where owner_user_id = ${request.owner_user_id}
        and employee_user_id is null
      order by slot_index asc
      limit 1
      for update;
    `

    const freeSlot = freeSlotRows[0]?.slot_index
    if (!Number.isInteger(freeSlot)) {
      await client.query('rollback')
      sendJson(res, { error: 'Свободных мест больше нет' }, 409)
      return
    }

    await client.sql`
      update business_staff
      set employee_user_id = ${request.requester_user_id},
          updated_at = now()
      where owner_user_id = ${request.owner_user_id}
        and slot_index = ${freeSlot};
    `

    await client.sql`
      update business_join_requests
      set status = 'accepted',
          reviewed_by_user_id = ${userId},
          updated_at = now()
      where id = ${requestId};
    `

    await client.sql`
      update business_join_requests
      set status = 'cancelled',
          reviewed_by_user_id = ${userId},
          updated_at = now()
      where requester_user_id = ${request.requester_user_id}
        and status = 'pending'
        and id <> ${requestId};
    `

    await client.sql`
      update business_invites
      set status = 'cancelled',
          updated_at = now()
      where target_user_id = ${request.requester_user_id}
        and status = 'pending';
    `

    await client.query('commit')
    sendJson(res, { ok: true, inbox: await loadInbox(userId) })
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
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

    await ensureUser(userId)
    sendJson(res, { inbox: await loadInbox(userId) })
    return
  }

  if (req.method !== 'POST') {
    sendText(res, 'Method Not Allowed', 405)
    return
  }

  const body = await readJsonBody<
    | { action?: 'respond_invite'; userId?: string; inviteId?: number; decision?: 'accept' | 'decline' }
    | { action?: 'respond_join_request'; userId?: string; requestId?: number; decision?: 'accept' | 'decline' }
    | null
  >(req)

  const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  const decision = body?.decision

  if (!userId || (decision !== 'accept' && decision !== 'decline')) {
    sendJson(res, { error: 'userId and decision are required' }, 400)
    return
  }

  await ensureUser(userId)

  if (body?.action === 'respond_invite') {
    const inviteId = Number(body?.inviteId)
    if (!Number.isInteger(inviteId) || inviteId <= 0) {
      sendJson(res, { error: 'inviteId is required' }, 400)
      return
    }

    await respondToInvite(userId, inviteId, decision, res)
    return
  }

  if (body?.action === 'respond_join_request') {
    const requestId = Number(body?.requestId)
    if (!Number.isInteger(requestId) || requestId <= 0) {
      sendJson(res, { error: 'requestId is required' }, 400)
      return
    }

    await respondToJoinRequest(userId, requestId, decision, res)
    return
  }

  sendJson(res, { error: 'Unsupported action' }, 400)
}
