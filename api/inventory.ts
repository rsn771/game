import { sql } from '@vercel/postgres'

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
      | { userId?: string; cardId?: string; qty?: number }
      | null
    const userId = body?.userId
    const cardId = body?.cardId
    const qty = Math.max(1, Math.floor(body?.qty ?? 1))
    if (!userId || !cardId) return json({ error: 'userId and cardId are required' }, 400)

    await sql`
      insert into inventory (user_id, card_id, qty)
      values (${userId}, ${cardId}, ${qty})
      on conflict (user_id, card_id)
      do update set qty = inventory.qty + excluded.qty;
    `

    return json({ ok: true })
  }

  return new Response('Method Not Allowed', { status: 405 })
}

