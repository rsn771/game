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

type MailInvite = {
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
}

async function loadInbox(userId: string): Promise<MailInvite[]> {
  const { rows } = await sql<MailInvite>`
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
      sender.display_name as sender_display_name
    from business_invites bi
    join businesses b on b.owner_user_id = bi.owner_user_id
    left join users owner on owner.tg_user_id = bi.owner_user_id
    left join users sender on sender.tg_user_id = bi.sender_user_id
    where bi.target_user_id = ${userId}
      and bi.status = 'pending'
    order by bi.updated_at desc;
  `

  return rows.map((row) => ({
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
  }))
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
    | null
  >(req)

  const userId = body?.userId
  const inviteId = Number(body?.inviteId)
  const decision = body?.decision

  if (!userId || !Number.isInteger(inviteId) || inviteId <= 0 || (decision !== 'accept' && decision !== 'decline')) {
    sendJson(res, { error: 'userId, inviteId and decision are required' }, 400)
    return
  }

  await ensureUser(userId)
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

    await client.query('commit')
    sendJson(res, { ok: true, inbox: await loadInbox(userId) })
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
