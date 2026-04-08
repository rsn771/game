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

  const { rows } = await sql<{ stars: string }>`
    update users
    set stars = greatest(0, stars + ${delta}),
        updated_at = now()
    where tg_user_id = ${userId}
    returning stars::text as stars;
  `

  sendJson(res, {
    ok: true,
    stars: rows[0]?.stars ?? '0',
  })
}
