import { sql } from '@vercel/postgres'
import { ensureSchema, ensureUser } from './_lib/db'

export const config = {
  runtime: 'nodejs',
}

const BUSINESS_OPEN_COST = 100_000
const BUSINESS_START_CAPITAL = 80_000

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function normalizeRequiredText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

async function loadBusiness(userId: string) {
  const { rows } = await sql<{ name: string; description: string; capital: string }>`
    select name, description, capital::text as capital
    from businesses
    where owner_user_id = ${userId}
    limit 1;
  `
  return rows[0] ?? null
}

async function loadStars(userId: string) {
  const { rows } = await sql<{ stars: string }>`
    select stars::text as stars
    from users
    where tg_user_id = ${userId}
    limit 1;
  `
  return rows[0]?.stars ?? '0'
}

export default async function handler(req: Request): Promise<Response> {
  await ensureSchema()

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    if (!userId) return json({ error: 'userId is required' }, 400)

    await ensureUser(userId)
    const business = await loadBusiness(userId)

    return json({
      business,
      stars: await loadStars(userId),
    })
  }

  if (req.method === 'POST') {
    const body = await req.json().catch(() => null) as
      | { userId?: string; name?: string; description?: string }
      | null
    const userId = body?.userId
    if (!userId) return json({ error: 'userId is required' }, 400)

    await ensureUser(userId)

    const existing = await loadBusiness(userId)
    if (existing) {
      return json({ error: 'Бизнес уже открыт' }, 409)
    }

    const name = normalizeRequiredText(body?.name, 'Мой бизнес')
    const description = normalizeRequiredText(body?.description, 'Описание бизнеса появится позже.')

    const { rows: starRows } = await sql<{ stars: string }>`
      update users
      set stars = stars - ${BUSINESS_OPEN_COST},
          updated_at = now()
      where tg_user_id = ${userId}
        and stars >= ${BUSINESS_OPEN_COST}
      returning stars::text as stars;
    `

    const nextStars = starRows[0]?.stars
    if (!nextStars) {
      return json({ error: 'Недостаточно звёзд для открытия бизнеса' }, 400)
    }

    await sql`
      insert into businesses (owner_user_id, name, description, capital)
      values (${userId}, ${name}, ${description}, ${BUSINESS_START_CAPITAL});
    `

    return json({
      ok: true,
      stars: nextStars,
      business: {
        name,
        description,
        capital: String(BUSINESS_START_CAPITAL),
      },
    })
  }

  if (req.method === 'PATCH') {
    const body = await req.json().catch(() => null) as
      | { userId?: string; name?: string; description?: string }
      | null
    const userId = body?.userId
    if (!userId) return json({ error: 'userId is required' }, 400)

    await ensureUser(userId)

    const existing = await loadBusiness(userId)
    if (!existing) {
      return json({ error: 'Бизнес ещё не открыт' }, 404)
    }

    const name = normalizeRequiredText(body?.name, existing.name)
    const description = normalizeRequiredText(body?.description, existing.description || 'Описание бизнеса появится позже.')

    const { rows } = await sql<{ name: string; description: string; capital: string }>`
      update businesses
      set name = ${name},
          description = ${description},
          updated_at = now()
      where owner_user_id = ${userId}
      returning name, description, capital::text as capital;
    `

    return json({
      ok: true,
      business: rows[0] ?? existing,
      stars: await loadStars(userId),
    })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
