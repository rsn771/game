import { sql } from '@vercel/postgres'
import { ensureSchema, ensureUser } from './_lib/db.js'
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

const BUSINESS_OPEN_COST = 100_000
const BUSINESS_START_CAPITAL = 80_000

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

export default async function handler(req: NodeApiRequest, res: NodeApiResponse): Promise<void> {
  await ensureSchema()

  if (req.method === 'GET') {
    const userId = getQueryParam(req, 'userId')
    if (!userId) {
      sendJson(res, { error: 'userId is required' }, 400)
      return
    }

    await ensureUser(userId)
    const business = await loadBusiness(userId)

    sendJson(res, {
      business,
      stars: await loadStars(userId),
    })
    return
  }

  if (req.method === 'POST') {
    const body = await readJsonBody<
      | { userId?: string; name?: string; description?: string; restore?: boolean }
      | null
    >(req)
    const userId = body?.userId
    if (!userId) {
      sendJson(res, { error: 'userId is required' }, 400)
      return
    }

    await ensureUser(userId)

    const existing = await loadBusiness(userId)
    const isRestore = body?.restore === true
    if (existing) {
      if (isRestore) {
        sendJson(res, {
          ok: true,
          business: existing,
          stars: await loadStars(userId),
        })
        return
      }

      sendJson(res, { error: 'Бизнес уже открыт' }, 409)
      return
    }

    const name = normalizeRequiredText(body?.name, 'Мой бизнес')
    const description = normalizeRequiredText(body?.description, 'Описание бизнеса появится позже.')

    if (isRestore) {
      await sql`
        insert into businesses (owner_user_id, name, description, capital)
        values (${userId}, ${name}, ${description}, ${BUSINESS_START_CAPITAL});
      `

      sendJson(res, {
        ok: true,
        stars: await loadStars(userId),
        business: {
          name,
          description,
          capital: String(BUSINESS_START_CAPITAL),
        },
      })
      return
    }

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
      sendJson(res, { error: 'Недостаточно звёзд для открытия бизнеса' }, 400)
      return
    }

    await sql`
      insert into businesses (owner_user_id, name, description, capital)
      values (${userId}, ${name}, ${description}, ${BUSINESS_START_CAPITAL});
    `

    sendJson(res, {
      ok: true,
      stars: nextStars,
      business: {
        name,
        description,
        capital: String(BUSINESS_START_CAPITAL),
      },
    })
    return
  }

  if (req.method === 'PATCH') {
    const body = await readJsonBody<
      | { userId?: string; name?: string; description?: string }
      | null
    >(req)
    const userId = body?.userId
    if (!userId) {
      sendJson(res, { error: 'userId is required' }, 400)
      return
    }

    await ensureUser(userId)

    const existing = await loadBusiness(userId)
    if (!existing) {
      sendJson(res, { error: 'Бизнес ещё не открыт' }, 404)
      return
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

    sendJson(res, {
      ok: true,
      business: rows[0] ?? existing,
      stars: await loadStars(userId),
    })
    return
  }

  sendText(res, 'Method Not Allowed', 405)
}
