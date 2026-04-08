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

const SLOT_SPIN_COST = 100
const SLOT_JACKPOT_STARS = 10_000

type SlotRewardDef = {
  cardId: string
  slotName: string
  inventoryName: string
  imageSrc: string
}

const SLOT_REWARDS: SlotRewardDef[] = [
  {
    cardId: 'rose_red',
    slotName: 'Роза',
    inventoryName: 'Красная Роза',
    imageSrc: '/card-rose.png',
  },
  {
    cardId: 'rose_2red',
    slotName: '2 розы',
    inventoryName: '2 красные розы',
    imageSrc: '/card-rose-2red.png',
  },
  {
    cardId: 'rose_bouquet',
    slotName: '3 розы',
    inventoryName: 'Букет красных роз',
    imageSrc: '/card-rose-bouquet.png',
  },
  {
    cardId: 'rose_white',
    slotName: 'Белая роза',
    inventoryName: 'Белая Роза',
    imageSrc: '/card-rose-white.png',
  },
  {
    cardId: 'knife_kitchen',
    slotName: 'Нож',
    inventoryName: 'Кухонный нож',
    imageSrc: '/card-knife-kitchen.png',
  },
]

function pickRandomSlotReward(): SlotRewardDef {
  return SLOT_REWARDS[Math.floor(Math.random() * SLOT_REWARDS.length)]
}

export default async function handler(req: NodeApiRequest, res: NodeApiResponse): Promise<void> {
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

  const { rows: starRows } = await sql<{ stars: string }>`
    update users
    set stars = stars - ${SLOT_SPIN_COST},
        updated_at = now()
    where tg_user_id = ${userId}
      and stars >= ${SLOT_SPIN_COST}
    returning stars::text as stars;
  `

  const nextStars = starRows[0]?.stars
  if (!nextStars) {
    sendJson(res, { error: 'Недостаточно звёзд для прокрута' }, 400)
    return
  }

  const rewards = [pickRandomSlotReward(), pickRandomSlotReward(), pickRandomSlotReward()]
  const isJackpot = rewards.every((reward) => reward.cardId === rewards[0].cardId)

  let finalStars = nextStars

  if (isJackpot) {
    const { rows: jackpotRows } = await sql<{ stars: string }>`
      update users
      set stars = stars + ${SLOT_JACKPOT_STARS},
          updated_at = now()
      where tg_user_id = ${userId}
      returning stars::text as stars;
    `
    finalStars = jackpotRows[0]?.stars ?? nextStars
  }

  sendJson(res, {
    ok: true,
    stars: finalStars,
    rewards,
    jackpot: isJackpot,
  })
}
