import { sql } from '@vercel/postgres'
import { ensureSchema } from './_lib/db.js'
import { sendJson, sendText, type NodeApiRequest, type NodeApiResponse } from './_lib/http.js'

export const config = {
  runtime: 'nodejs',
}

export default async function handler(req: NodeApiRequest, res: NodeApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendText(res, 'Method Not Allowed', 405)
    return
  }

  await ensureSchema()

  const { rows } = await sql<{ id: string; name: string; image_src: string }>`
    select id, name, image_src from cards order by id asc;
  `

  sendJson(res, { cards: rows })
}
