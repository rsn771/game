import { sql } from '@vercel/postgres'
import { ensureUser, getUserById } from './_lib/db'

export const config = {
  runtime: 'nodejs',
}

type Relation = 'friend' | 'incoming' | 'outgoing'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    if (!userId) return json({ error: 'userId is required' }, 400)

    await ensureUser(userId)
    return json(await loadFriends(userId))
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const body = await req.json().catch(() => null) as
    | { action?: 'request' | 'send_item'; userId?: string; targetUserId?: string; cardId?: string }
    | null

  const userId = body?.userId
  const targetUserId = body?.targetUserId
  if (!userId || !targetUserId) {
    return json({ error: 'userId and targetUserId are required' }, 400)
  }
  if (userId === targetUserId) {
    return json({ error: 'Cannot perform this action on yourself' }, 400)
  }

  await ensureUser(userId)
  const targetUser = await getUserById(targetUserId)
  if (!targetUser) {
    return json({ error: 'Target user is not registered' }, 404)
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
      return json({ ok: true, relation: 'friend', lists: await loadFriends(userId) })
    }

    if (reverse?.status === 'pending') {
      await sql`
        update friend_requests
        set status = 'accepted', updated_at = now()
        where from_user_id = ${targetUserId}
          and to_user_id = ${userId};
      `
      return json({ ok: true, relation: 'friend', lists: await loadFriends(userId) })
    }

    if (direct?.status === 'pending') {
      return json({ ok: true, relation: 'outgoing', lists: await loadFriends(userId) })
    }

    await sql`
      insert into friend_requests (from_user_id, to_user_id, status)
      values (${userId}, ${targetUserId}, 'pending')
      on conflict (from_user_id, to_user_id)
      do update set status = 'pending', updated_at = now();
    `

    return json({ ok: true, relation: 'outgoing', lists: await loadFriends(userId) })
  }

  if (body?.action === 'send_item') {
    const cardId = body.cardId
    if (!cardId) return json({ error: 'cardId is required' }, 400)

    const { rows: senderRows } = await sql<{ qty: number }>`
      select qty
      from inventory
      where user_id = ${userId}
        and card_id = ${cardId}
      limit 1;
    `

    const senderCard = senderRows[0]
    if (!senderCard || senderCard.qty < 1) {
      return json({ error: 'Item is not available in inventory' }, 400)
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

    return json({ ok: true })
  }

  return json({ error: 'Unsupported action' }, 400)
}
