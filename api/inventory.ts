import { sql } from '@vercel/postgres'
import { ensureUser } from './_lib/db'

export const config = {
  runtime: 'nodejs',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    if (!userId) return json({ error: 'userId is required' }, 400)
    await ensureUser(userId)

    const { rows } = await sql<{ card_id: string; name: string; image_src: string; qty: number }>`
      select i.card_id, c.name, c.image_src, i.qty
      from inventory i
      join cards c on c.id = i.card_id
      where i.user_id = ${userId}
      order by i.card_id asc;
    `

    return json({ items: rows })
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => null) as
      | { userId?: string; cardId?: string; qty?: number; merge?: { from: string[]; to: string } }
      | null
    const userId = body?.userId
    if (!userId) return json({ error: 'userId is required' }, 400)
    await ensureUser(userId)

    if (body?.merge) {
      const { from, to } = body.merge
      if (!Array.isArray(from) || from.length !== 2 || !to) {
        return json({ error: 'merge.from (2 card ids) and merge.to are required' }, 400)
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
      return json({ ok: true })
    }

    const cardId = body?.cardId
    const qty = Math.max(1, Math.floor(body?.qty ?? 1))
    if (!cardId) return json({ error: 'cardId is required' }, 400)

    await sql`
      insert into inventory (user_id, card_id, qty)
      values (${userId}, ${cardId}, ${qty})
      on conflict (user_id, card_id)
      do update set qty = inventory.qty + excluded.qty;
    `

    return json({ ok: true })
  }

  if (req.method === 'PATCH') {
    const body = await req.json().catch(() => null) as
      | { userId?: string; cardId?: string; qty?: number }
      | null
    const userId = body?.userId
    const cardId = body?.cardId
    const qty = Math.max(0, Math.floor(body?.qty ?? 0))
    if (!userId || !cardId) return json({ error: 'userId and cardId are required' }, 400)
    await ensureUser(userId)

    await sql`
      insert into inventory (user_id, card_id, qty)
      values (${userId}, ${cardId}, ${qty})
      on conflict (user_id, card_id)
      do update set qty = excluded.qty;
    `
    return json({ ok: true })
  }

  return new Response('Method Not Allowed', { status: 405 })
}

