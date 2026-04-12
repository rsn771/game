import { ensureUser, getUserById, migrateAnonymousUserData, upsertUserProfile } from './_lib/db.js'
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

export default async function handler(req: NodeApiRequest, res: NodeApiResponse): Promise<void> {
  if (req.method === 'POST') {
    const body = await readJsonBody<
      | {
          userId?: string
          previousUserId?: string | null
          username?: string | null
          displayName?: string | null
          avatarModel?: string | null
          avatarItem?: string | null
        }
      | null
    >(req)
    const userId = body?.userId
    if (!userId) {
      sendJson(res, { error: 'userId is required' }, 400)
      return
    }

    if (typeof body?.previousUserId === 'string' && body.previousUserId.trim().length > 0) {
      await migrateAnonymousUserData(body.previousUserId.trim(), userId)
    }

    await upsertUserProfile({
      userId,
      username: body?.username,
      displayName: body?.displayName,
      avatarModel: body?.avatarModel,
      avatarItem: body?.avatarItem,
    })

    const profile = await getUserById(userId)
    if (!profile) {
      sendJson(res, { error: 'User not found' }, 404)
      return
    }

    sendJson(res, {
      userId: profile.tg_user_id,
      username: profile.username,
      displayName: profile.display_name,
      stars: profile.stars,
      avatarModel: profile.avatar_model ?? 'classic',
      avatarItem: profile.avatar_item ?? null,
    })
    return
  }

  if (req.method !== 'GET') {
    sendText(res, 'Method Not Allowed', 405)
    return
  }

  const userId = getQueryParam(req, 'userId')
  if (!userId) {
    sendJson(res, { error: 'userId is required' }, 400)
    return
  }

  await ensureUser(userId)

  const profile = await getUserById(userId)
  if (!profile) {
    sendJson(res, { error: 'User not found' }, 404)
    return
  }

  sendJson(res, {
    userId: profile.tg_user_id,
    username: profile.username,
    displayName: profile.display_name,
    stars: profile.stars,
    avatarModel: profile.avatar_model ?? 'classic',
    avatarItem: profile.avatar_item ?? null,
  })
}
