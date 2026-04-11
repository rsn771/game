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

const APARTMENT_CARD_ID = 'asset_apartment'
const SKYLINE_STUDIO_CARD_ID = 'asset_skyline_studio'
const APARTMENT_SHOP_PRICE = 10_000

const SHOP_ITEMS = {
  [APARTMENT_CARD_ID]: {
    price: APARTMENT_SHOP_PRICE,
  },
  [SKYLINE_STUDIO_CARD_ID]: {
    price: 50_000,
  },
} as const

export default async function handler(req: NodeApiRequest, res: NodeApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendText(res, 'Method Not Allowed', 405)
    return
  }

  const body = await readJsonBody<{ userId?: string; itemId?: string } | null>(req)
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  const itemId = typeof body?.itemId === 'string' ? body.itemId.trim() : ''
  const itemConfig = SHOP_ITEMS[itemId as keyof typeof SHOP_ITEMS]

  if (!userId || !itemConfig) {
    sendJson(res, { error: 'userId and valid itemId are required' }, 400)
    return
  }

  await ensureUser(userId)
  const client = await sql.connect()

  try {
    await client.query('begin')

    const { rows: ownedRows } = await client.sql<{ qty: number }>`
      select qty
      from inventory
      where user_id = ${userId}
        and card_id = ${itemId}
      limit 1
      for update;
    `

    if ((ownedRows[0]?.qty ?? 0) > 0) {
      await client.query('rollback')
      sendJson(res, { error: 'Квартира уже куплена' }, 409)
      return
    }

    const { rows: userRows } = await client.sql<{ stars: string }>`
      update users
      set stars = stars - ${itemConfig.price},
          updated_at = now()
      where tg_user_id = ${userId}
        and stars >= ${itemConfig.price}
      returning stars::text as stars;
    `

    if (!userRows[0]?.stars) {
      await client.query('rollback')
      sendJson(res, { error: 'Недостаточно звёзд для покупки' }, 400)
      return
    }

    await client.sql`
      insert into inventory (user_id, card_id, qty)
      values (${userId}, ${itemId}, 1)
      on conflict (user_id, card_id)
      do update set qty = inventory.qty + 1;
    `

    await client.query('commit')
    sendJson(res, { ok: true, stars: userRows[0].stars })
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
