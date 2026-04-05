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

function normalizeSearchQuery(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('@') ? trimmed.slice(1).trim() : trimmed
}

function isTelegramNumericId(value: string): boolean {
  return /^\d{5,20}$/.test(value)
}

async function loadRelation(userId: string, targetUserId: string) {
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
    )
    limit 2;
  `

  const direct = rows.find((row) => row.from_user_id === userId && row.to_user_id === targetUserId)
  const reverse = rows.find((row) => row.from_user_id === targetUserId && row.to_user_id === userId)

  if (direct?.status === 'accepted' || reverse?.status === 'accepted') return 'friend'
  if (direct?.status === 'pending') return 'outgoing'
  if (reverse?.status === 'pending') return 'incoming'
  return 'none'
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  const query = normalizeSearchQuery(url.searchParams.get('query') ?? '')
  if (!userId) return json({ error: 'userId is required' }, 400)

  await ensureUser(userId)

  if (!query) {
    return json({ users: [] })
  }

  const queryLower = query.toLowerCase()
  const pattern = `%${queryLower}%`
  const idPrefix = `${query}%`

  const { rows } = await sql<{
    tg_user_id: string
    username: string | null
    display_name: string | null
    relation: 'none' | 'friend' | 'outgoing' | 'incoming'
  }>`
    select
      u.tg_user_id,
      u.username,
      u.display_name,
      case
        when exists (
          select 1
          from friend_requests fr
          where (
            (fr.from_user_id = ${userId} and fr.to_user_id = u.tg_user_id)
            or
            (fr.from_user_id = u.tg_user_id and fr.to_user_id = ${userId})
          )
          and fr.status = 'accepted'
        ) then 'friend'
        when exists (
          select 1
          from friend_requests fr
          where fr.from_user_id = ${userId}
            and fr.to_user_id = u.tg_user_id
            and fr.status = 'pending'
        ) then 'outgoing'
        when exists (
          select 1
          from friend_requests fr
          where fr.from_user_id = u.tg_user_id
            and fr.to_user_id = ${userId}
            and fr.status = 'pending'
        ) then 'incoming'
        else 'none'
      end as relation
    from users u
    where u.tg_user_id <> ${userId}
      and (
        u.tg_user_id like ${idPrefix}
        or lower(coalesce(u.username, '')) like ${pattern}
        or lower(coalesce(u.display_name, '')) like ${pattern}
      )
    order by
      case
        when u.tg_user_id = ${query} then 0
        when lower(coalesce(u.username, '')) = ${queryLower} then 1
        when lower(coalesce(u.display_name, '')) = ${queryLower} then 2
        else 3
      end,
      coalesce(u.username, u.display_name, u.tg_user_id) asc
    limit 20;
  `

  const users = rows.map((row) => ({
    userId: row.tg_user_id,
    username: row.username,
    displayName: row.display_name,
    relation: row.relation,
  }))

  if (users.length === 0 && query !== userId && isTelegramNumericId(query)) {
    users.push({
      userId: query,
      username: null,
      displayName: null,
      relation: await loadRelation(userId, query),
    })
  }

  return json({
    users,
  })
}
