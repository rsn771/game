import { sql } from '@vercel/postgres'
import { ensureUser } from './_lib/db.js'
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

export default async function handler(req: NodeApiRequest, res: NodeApiResponse): Promise<void> {
  if (req.method === 'GET') {
    const userId = getQueryParam(req, 'userId')
    if (!userId) {
      sendJson(res, { error: 'userId is required' }, 400)
      return
    }

    await ensureUser(userId)

    await sql`
      delete from inventory_timed
      where user_id = ${userId}
        and expires_at <= now();
    `

    const { rows } = await sql<{
      instance_id: number | null
      card_id: string
      name: string
      image_src: string
      qty: number
      expires_at: string | null
      transferable: boolean
    }>`
      with permanent_items as (
        select
          null::bigint as instance_id,
          i.card_id,
          c.name,
          c.image_src,
          i.qty,
          null::timestamptz as expires_at,
          true as transferable
        from inventory i
        join cards c on c.id = i.card_id
        where i.user_id = ${userId}
      ),
      timed_items as (
        select
          t.id as instance_id,
          t.card_id,
          c.name,
          c.image_src,
          1 as qty,
          t.expires_at,
          false as transferable
        from inventory_timed t
        join cards c on c.id = t.card_id
        where t.user_id = ${userId}
          and t.expires_at > now()
      )
      select *
      from permanent_items
      union all
      select *
      from timed_items
      order by card_id asc, expires_at asc nulls last, instance_id asc nulls first;
    `

    sendJson(res, { items: rows })
    return
  }

  if (req.method === 'POST') {
    const body = await readJsonBody<
      | { userId?: string; cardId?: string; qty?: number; merge?: { from: string[]; to: string } }
      | null
    >(req)
    const userId = body?.userId
    if (!userId) {
      sendJson(res, { error: 'userId is required' }, 400)
      return
    }

    await ensureUser(userId)

    if (body?.merge) {
      const { from, to } = body.merge
      if (!Array.isArray(from) || from.length !== 2 || !to) {
        sendJson(res, { error: 'merge.from (2 card ids) and merge.to are required' }, 400)
        return
      }

      const [a, b] = from
      await sql`
        update inventory set qty = greatest(0, qty - 1)
        where user_id = ${userId} and card_id = ${a}
      `
      await sql`
        update inventory set qty = greatest(0, qty - 1)
        where user_id = ${userId} and card_id = ${b}
      `
      await sql`
        insert into inventory (user_id, card_id, qty)
        values (${userId}, ${to}, 1)
        on conflict (user_id, card_id)
        do update set qty = inventory.qty + 1
      `

      sendJson(res, { ok: true })
      return
    }

    const cardId = body?.cardId
    const qty = Math.max(1, Math.floor(body?.qty ?? 1))
    if (!cardId) {
      sendJson(res, { error: 'cardId is required' }, 400)
      return
    }

    await sql`
      insert into inventory (user_id, card_id, qty)
      values (${userId}, ${cardId}, ${qty})
      on conflict (user_id, card_id)
      do update set qty = inventory.qty + excluded.qty;
    `

    sendJson(res, { ok: true })
    return
  }

  if (req.method === 'PATCH') {
    const body = await readJsonBody<
      | { userId?: string; cardId?: string; qty?: number }
      | null
    >(req)
    const userId = body?.userId
    const cardId = body?.cardId
    const qty = Math.max(0, Math.floor(body?.qty ?? 0))
    if (!userId || !cardId) {
      sendJson(res, { error: 'userId and cardId are required' }, 400)
      return
    }

    await ensureUser(userId)

    await sql`
      insert into inventory (user_id, card_id, qty)
      values (${userId}, ${cardId}, ${qty})
      on conflict (user_id, card_id)
      do update set qty = excluded.qty;
    `

    sendJson(res, { ok: true })
    return
  }

  sendText(res, 'Method Not Allowed', 405)
}
