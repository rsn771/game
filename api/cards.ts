import { sql } from '@vercel/postgres'

export const config = {
  runtime: 'nodejs',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const { rows } = await sql<{ id: string; name: string; image_src: string }>`
    select id, name, image_src from cards order by id asc;
  `

  return new Response(JSON.stringify({ cards: rows }), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

