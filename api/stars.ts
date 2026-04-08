import { sql } from '@vercel/postgres'
import { ensureUser } from './_lib/db.js'
import {
  readJsonBody,
  sendJson,
  sendText,
  type NodeApiRequest,
  type NodeApiResponse,
} from './_lib/http.js'

export const config = {
  runtime: 'nodejs',
}

const BUSINESS_CAPITAL_DOUBLE_THRESHOLD = 150_000
const EMPLOYEE_CLICK_STARS = 5
const OWNER_CLICK_STARS = 3
const BUSINESS_CLICK_CAPITAL = 1

type StarResponse = {
  ok: true
  stars: string
  businessCapital?: string
}

function getEmployeeClickPayouts(currentCapital: number) {
  const multiplier = currentCapital >= BUSINESS_CAPITAL_DOUBLE_THRESHOLD ? 2 : 1
  return {
    workerStars: EMPLOYEE_CLICK_STARS * multiplier,
    ownerStars: OWNER_CLICK_STARS * multiplier,
    businessCapital: BUSINESS_CLICK_CAPITAL * multiplier,
  }
}

async function applyPersonalStars(userId: string, delta: number): Promise<StarResponse> {
  const { rows } = await sql<{ stars: string }>`
    update users
    set stars = greatest(0, stars + ${delta}),
        updated_at = now()
    where tg_user_id = ${userId}
    returning stars::text as stars;
  `

  return {
    ok: true,
    stars: rows[0]?.stars ?? '0',
  }
}

export default async function handler(req: NodeApiRequest, res: NodeApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendText(res, 'Method Not Allowed', 405)
    return
  }

  const body = await readJsonBody<{ userId?: string; delta?: number } | null>(req)
  const userId = body?.userId
  const delta = Math.trunc(body?.delta ?? 0)

  if (!userId) {
    sendJson(res, { error: 'userId is required' }, 400)
    return
  }

  if (!Number.isFinite(delta) || delta === 0) {
    sendJson(res, { error: 'delta must be a non-zero integer' }, 400)
    return
  }

  await ensureUser(userId)

  if (delta < 0) {
    sendJson(res, await applyPersonalStars(userId, delta))
    return
  }

  const client = await sql.connect()

  try {
    await client.query('begin')

    const { rows: employmentRows } = await client.sql<{ owner_user_id: string; capital: string }>`
      select
        bs.owner_user_id,
        b.capital::text as capital
      from business_staff bs
      join businesses b on b.owner_user_id = bs.owner_user_id
      where bs.employee_user_id = ${userId}
      limit 1
      for update of b;
    `

    const employment = employmentRows[0]

    if (!employment) {
      const { rows } = await client.sql<{ stars: string }>`
        update users
        set stars = greatest(0, stars + ${delta}),
            updated_at = now()
        where tg_user_id = ${userId}
        returning stars::text as stars;
      `

      await client.query('commit')
      sendJson(res, {
        ok: true,
        stars: rows[0]?.stars ?? '0',
      })
      return
    }

    let nextCapital = Number(employment.capital)
    if (!Number.isFinite(nextCapital) || nextCapital < 0) {
      nextCapital = 0
    }

    let workerStarsTotal = 0
    let ownerStarsTotal = 0
    let businessCapitalTotal = 0

    for (let clickIndex = 0; clickIndex < delta; clickIndex += 1) {
      const payout = getEmployeeClickPayouts(nextCapital)
      workerStarsTotal += payout.workerStars
      ownerStarsTotal += payout.ownerStars
      businessCapitalTotal += payout.businessCapital
      nextCapital += payout.businessCapital
    }

    const { rows: workerRows } = await client.sql<{ stars: string }>`
      update users
      set stars = stars + ${workerStarsTotal},
          updated_at = now()
      where tg_user_id = ${userId}
      returning stars::text as stars;
    `

    await client.sql`
      update users
      set stars = stars + ${ownerStarsTotal},
          updated_at = now()
      where tg_user_id = ${employment.owner_user_id};
    `

    const { rows: businessRows } = await client.sql<{ capital: string }>`
      update businesses
      set capital = capital + ${businessCapitalTotal},
          updated_at = now()
      where owner_user_id = ${employment.owner_user_id}
      returning capital::text as capital;
    `

    await client.query('commit')

    sendJson(res, {
      ok: true,
      stars: workerRows[0]?.stars ?? '0',
      businessCapital: businessRows[0]?.capital ?? String(nextCapital),
    })
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
