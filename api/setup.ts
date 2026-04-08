import { ensureSchema } from './_lib/db.js'
import { sendJson, sendText, type NodeApiRequest, type NodeApiResponse } from './_lib/http.js'

export const config = {
  runtime: 'nodejs',
}

export default async function handler(req: NodeApiRequest, res: NodeApiResponse): Promise<void> {
  if (req.method !== 'POST' && req.method !== 'GET') {
    sendText(res, 'Method Not Allowed', 405)
    return
  }

  await ensureSchema()
  sendJson(res, { ok: true })
}
