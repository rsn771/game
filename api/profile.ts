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
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId) return json({ error: 'userId is required' }, 400)

  await ensureUser(userId)

  const { rows } = await sql<{ tg_user_id: string; stars: string }>`
    select tg_user_id, stars::text as stars
    from users
    where tg_user_id = ${userId}
    limit 1;
  `

  const profile = rows[0]
  if (!profile) {
    return json({ error: 'User not found' }, 404)
  }

  return json({
    userId: profile.tg_user_id,
    stars: profile.stars,
  })
}
