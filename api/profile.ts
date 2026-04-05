import { ensureUser, getUserById, upsertUserProfile } from './_lib/db'

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
  if (req.method === 'POST') {
    const body = await req.json().catch(() => null) as
      | { userId?: string; username?: string | null; displayName?: string | null }
      | null
    const userId = body?.userId
    if (!userId) return json({ error: 'userId is required' }, 400)

    await upsertUserProfile({
      userId,
      username: body?.username,
      displayName: body?.displayName,
    })

    const profile = await getUserById(userId)
    if (!profile) return json({ error: 'User not found' }, 404)

    return json({
      userId: profile.tg_user_id,
      username: profile.username,
      displayName: profile.display_name,
      stars: profile.stars,
    })
  }

  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId) return json({ error: 'userId is required' }, 400)

  await ensureUser(userId)

  const profile = await getUserById(userId)
  if (!profile) {
    return json({ error: 'User not found' }, 404)
  }

  return json({
    userId: profile.tg_user_id,
    username: profile.username,
    displayName: profile.display_name,
    stars: profile.stars,
  })
}
