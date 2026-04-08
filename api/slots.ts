import { sql } from '@vercel/postgres'
import { ensureUser } from './_lib/db'

export const config = {
  runtime: 'nodejs',
}

const SLOT_SPIN_COST = 100

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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function pickRandomSlotReward(): SlotRewardDef {
  return SLOT_REWARDS[Math.floor(Math.random() * SLOT_REWARDS.length)]
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const body = await req.json().catch(() => null) as { userId?: string } | null
  const userId = body?.userId
  if (!userId) return json({ error: 'userId is required' }, 400)

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
    return json({ error: 'Недостаточно звёзд для прокрута' }, 400)
  }

  const rewards = [pickRandomSlotReward(), pickRandomSlotReward(), pickRandomSlotReward()]

  for (const reward of rewards) {
    await sql`
      insert into inventory (user_id, card_id, qty)
      values (${userId}, ${reward.cardId}, 1)
      on conflict (user_id, card_id)
      do update set qty = inventory.qty + 1;
    `
  }

  return json({
    ok: true,
    stars: nextStars,
    rewards,
  })
}
