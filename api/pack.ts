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

const PACK_COOLDOWN_MS = 12 * 60 * 60 * 1000
const APARTMENT_CARD_ID = 'asset_apartment'

type PackRewardPayload =
  | {
      kind: 'stars'
      title: string
      subtitle: string
      starsAwarded: number
    }
  | {
      kind: 'item'
      title: string
      subtitle: string
      cardId: string
      imageSrc: string
    }
  | {
      kind: 'empty'
      title: string
      subtitle: string
    }

function pickPackReward(): PackRewardPayload {
  const roll = Math.random() * 100

  if (roll < 40) {
    return {
      kind: 'stars',
      title: '+10 звёзд',
      subtitle: 'На баланс',
      starsAwarded: 10,
    }
  }

  if (roll < 80) {
    return {
      kind: 'stars',
      title: '+100 звёзд',
      subtitle: 'На баланс',
      starsAwarded: 100,
    }
  }

  if (roll < 90) {
    return {
      kind: 'item',
      title: 'Квартира',
      subtitle: 'Новый предмет',
      cardId: APARTMENT_CARD_ID,
      imageSrc: '/home-bg-apartment-sunrise.svg',
    }
  }

  // Requested chances add up to 90%, so the remaining 10% stays as an empty pack.
  return {
    kind: 'empty',
    title: 'Пусто',
    subtitle: 'В этот раз без награды',
  }
}

function getNextOpenAt(lastOpenedAt: Date | string | null): number | null {
  if (!lastOpenedAt) return null
  const openedAtMs = new Date(lastOpenedAt).getTime()
  if (!Number.isFinite(openedAtMs)) return null
  return openedAtMs + PACK_COOLDOWN_MS
}

export default async function handler(req: NodeApiRequest, res: NodeApiResponse): Promise<void> {
  if (req.method === 'GET') {
    const userId = getQueryParam(req, 'userId')
    if (!userId) {
      sendJson(res, { error: 'userId is required' }, 400)
      return
    }

    await ensureUser(userId)

    const { rows } = await sql<{ stars: string; last_pack_opened_at: string | null }>`
      select
        stars::text as stars,
        last_pack_opened_at::text as last_pack_opened_at
      from users
      where tg_user_id = ${userId}
      limit 1;
    `

    const row = rows[0]
    const nextOpenAt = getNextOpenAt(row?.last_pack_opened_at ?? null)
    const now = Date.now()
    sendJson(res, {
      ok: true,
      stars: row?.stars ?? '0',
      available: !nextOpenAt || nextOpenAt <= now,
      nextOpenAt: nextOpenAt && nextOpenAt > now ? nextOpenAt : null,
    })
    return
  }

  if (req.method !== 'POST') {
    sendText(res, 'Method Not Allowed', 405)
    return
  }

  const body = await readJsonBody<{ userId?: string } | null>(req)
  const userId = body?.userId
  if (!userId) {
    sendJson(res, { error: 'userId is required' }, 400)
    return
  }

  await ensureUser(userId)
  const client = await sql.connect()

  try {
    await client.query('begin')

    const { rows } = await client.sql<{ stars: string; last_pack_opened_at: string | null }>`
      select
        stars::text as stars,
        last_pack_opened_at::text as last_pack_opened_at
      from users
      where tg_user_id = ${userId}
      limit 1
      for update;
    `

    const row = rows[0]
    const now = Date.now()
    const nextOpenAt = getNextOpenAt(row?.last_pack_opened_at ?? null)

    if (nextOpenAt && nextOpenAt > now) {
      await client.query('rollback')
      sendJson(
        res,
        {
          error: 'Стикерпак ещё на перезарядке',
          available: false,
          nextOpenAt,
          stars: row?.stars ?? '0',
        },
        429,
      )
      return
    }

    const reward = pickPackReward()
    const grantedStars = reward.kind === 'stars' ? reward.starsAwarded : 0

    const { rows: userRows } = await client.sql<{ stars: string }>`
      update users
      set stars = stars + ${grantedStars},
          last_pack_opened_at = now(),
          updated_at = now()
      where tg_user_id = ${userId}
      returning stars::text as stars;
    `

    if (reward.kind === 'item') {
      await client.sql`
        insert into inventory (user_id, card_id, qty)
        values (${userId}, ${reward.cardId}, 1)
        on conflict (user_id, card_id)
        do update set qty = inventory.qty + 1;
      `
    }

    await client.query('commit')

    sendJson(res, {
      ok: true,
      stars: userRows[0]?.stars ?? row?.stars ?? '0',
      available: false,
      nextOpenAt: now + PACK_COOLDOWN_MS,
      reward,
    })
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
