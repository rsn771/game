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

function normalizeSceneItems(value: unknown) {
  const base = {
    left: null,
    center: null,
    right: null,
  } as Record<'left' | 'center' | 'right', string | null>

  if (!value || typeof value !== 'object') return base

  for (const slotId of ['left', 'center', 'right'] as const) {
    base[slotId] = typeof (value as Record<string, unknown>)[slotId] === 'string'
      ? ((value as Record<string, unknown>)[slotId] as string)
      : null
  }

  return base
}

function parseSceneItems(value: string | null | undefined) {
  if (typeof value !== 'string') return normalizeSceneItems(null)
  try {
    return normalizeSceneItems(JSON.parse(value) as unknown)
  } catch {
    return normalizeSceneItems(null)
  }
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
          avatarFace?: string | null
          avatarItem?: string | null
          sceneItems?: Record<string, string | null> | null
          homeBackground?: string | null
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
      avatarFace: body?.avatarFace,
      avatarItem: body?.avatarItem,
      sceneItems: body?.sceneItems,
      homeBackground: body?.homeBackground,
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
      avatarFace: profile.avatar_face ?? 'default',
      avatarItem: profile.avatar_item ?? null,
      homeBackground: profile.home_background ?? null,
      sceneItems: parseSceneItems(profile.scene_items),
      unlockedFaces: [
        'default',
        ...(profile.face_annoyed_unlocked ? ['annoyed_halfmoon'] : []),
      ],
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
    avatarFace: profile.avatar_face ?? 'default',
    avatarItem: profile.avatar_item ?? null,
    homeBackground: profile.home_background ?? null,
    sceneItems: parseSceneItems(profile.scene_items),
    unlockedFaces: [
      'default',
      ...(profile.face_annoyed_unlocked ? ['annoyed_halfmoon'] : []),
    ],
  })
}
