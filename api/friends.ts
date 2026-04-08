import { sql } from '@vercel/postgres'
import { ensureUser, getUserById } from './_lib/db.js'
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

type Relation = 'friend' | 'incoming' | 'outgoing'

function isTelegramNumericId(value: string): boolean {
  return /^\d{5,20}$/.test(value)
}

async function loadFriends(userId: string) {
  const { rows: friends } = await sql<{
    tg_user_id: string
    username: string | null
    display_name: string | null
  }>`
    select u.tg_user_id, u.username, u.display_name
    from friend_requests fr
    join users u on u.tg_user_id = case
      when fr.from_user_id = ${userId} then fr.to_user_id
      else fr.from_user_id
    end
    where (fr.from_user_id = ${userId} or fr.to_user_id = ${userId})
      and fr.status = 'accepted'
    order by coalesce(u.username, u.display_name, u.tg_user_id) asc;
  `

  const { rows: incoming } = await sql<{
    tg_user_id: string
    username: string | null
    display_name: string | null
  }>`
    select u.tg_user_id, u.username, u.display_name
    from friend_requests fr
    join users u on u.tg_user_id = fr.from_user_id
    where fr.to_user_id = ${userId}
      and fr.status = 'pending'
    order by fr.updated_at desc;
  `

  const { rows: outgoing } = await sql<{
    tg_user_id: string
    username: string | null
    display_name: string | null
  }>`
    select u.tg_user_id, u.username, u.display_name
    from friend_requests fr
    join users u on u.tg_user_id = fr.to_user_id
    where fr.from_user_id = ${userId}
      and fr.status = 'pending'
    order by fr.updated_at desc;
  `

  const mapRows = (
    rows: { tg_user_id: string; username: string | null; display_name: string | null }[],
    relation: Relation,
  ) => rows.map((row) => ({
    userId: row.tg_user_id,
    username: row.username,
    displayName: row.display_name,
    relation,
  }))

  return {
    friends: mapRows(friends, 'friend'),
    incoming: mapRows(incoming, 'incoming'),
    outgoing: mapRows(outgoing, 'outgoing'),
  }
}

export default async function handler(req: NodeApiRequest, res: NodeApiResponse): Promise<void> {
  if (req.method === 'GET') {
    const userId = getQueryParam(req, 'userId')
    if (!userId) {
      sendJson(res, { error: 'userId is required' }, 400)
      return
    }

    await ensureUser(userId)
    sendJson(res, await loadFriends(userId))
    return
  }

  if (req.method !== 'POST') {
    sendText(res, 'Method Not Allowed', 405)
    return
  }

  const body = await readJsonBody<
    | { action?: 'request' | 'send_item'; userId?: string; targetUserId?: string; cardId?: string }
    | null
  >(req)

  const userId = body?.userId
  const targetUserId = body?.targetUserId
  if (!userId || !targetUserId) {
    sendJson(res, { error: 'userId and targetUserId are required' }, 400)
    return
  }
  if (userId === targetUserId) {
    sendJson(res, { error: 'Cannot perform this action on yourself' }, 400)
    return
  }

  await ensureUser(userId)
  if (isTelegramNumericId(targetUserId)) {
    await ensureUser(targetUserId)
  }

  const targetUser = await getUserById(targetUserId)
  if (!targetUser) {
    sendJson(res, { error: 'Target user is not registered' }, 404)
    return
  }

  if (body?.action === 'request') {
    const { rows } = await sql<{
      from_user_id: string
      to_user_id: string
      status: 'pending' | 'accepted'
    }>`
      select from_user_id, to_user_id, status
      from friend_requests
      where (
        (from_user_id = ${userId} and to_user_id = ${targetUserId})
        or
        (from_user_id = ${targetUserId} and to_user_id = ${userId})
      );
    `

    const direct = rows.find((row) => row.from_user_id === userId && row.to_user_id === targetUserId)
    const reverse = rows.find((row) => row.from_user_id === targetUserId && row.to_user_id === userId)

    if (direct?.status === 'accepted' || reverse?.status === 'accepted') {
      sendJson(res, { ok: true, relation: 'friend', lists: await loadFriends(userId) })
      return
    }

    if (reverse?.status === 'pending') {
      await sql`
        update friend_requests
        set status = 'accepted', updated_at = now()
        where from_user_id = ${targetUserId}
          and to_user_id = ${userId};
      `

      sendJson(res, { ok: true, relation: 'friend', lists: await loadFriends(userId) })
      return
    }

    if (direct?.status === 'pending') {
      sendJson(res, { ok: true, relation: 'outgoing', lists: await loadFriends(userId) })
      return
    }

    await sql`
      insert into friend_requests (from_user_id, to_user_id, status)
      values (${userId}, ${targetUserId}, 'pending')
      on conflict (from_user_id, to_user_id)
      do update set status = 'pending', updated_at = now();
    `

    sendJson(res, { ok: true, relation: 'outgoing', lists: await loadFriends(userId) })
    return
  }

  if (body?.action === 'send_item') {
    const cardId = body.cardId
    if (!cardId) {
      sendJson(res, { error: 'cardId is required' }, 400)
      return
    }

    const { rows: senderRows } = await sql<{ qty: number }>`
      select qty
      from inventory
      where user_id = ${userId}
        and card_id = ${cardId}
      limit 1;
    `

    const senderCard = senderRows[0]
    if (!senderCard || senderCard.qty < 1) {
      sendJson(res, { error: 'Item is not available in inventory' }, 400)
      return
    }

    await sql`
      update inventory
      set qty = qty - 1
      where user_id = ${userId}
        and card_id = ${cardId}
        and qty > 0;
    `

    await sql`
      delete from inventory
      where user_id = ${userId}
        and card_id = ${cardId}
        and qty <= 0;
    `

    await sql`
      insert into inventory (user_id, card_id, qty)
      values (${targetUserId}, ${cardId}, 1)
      on conflict (user_id, card_id)
      do update set qty = inventory.qty + 1;
    `

    sendJson(res, { ok: true })
    return
  }

  sendJson(res, { error: 'Unsupported action' }, 400)
}
