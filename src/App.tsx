import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ComponentType } from 'react'

type TabKey = 'home' | 'inventory' | 'friends' | 'customize' | 'business'

type CardDef = { id: string; name: string; imageSrc: string }

type InventoryItem = {
  id: string
  cardId: string
  name: string
  imageSrc: string
}

type FriendRelation = 'self' | 'none' | 'friend' | 'incoming' | 'outgoing'

type UserPreview = {
  userId: string
  username: string | null
  displayName: string | null
  relation: FriendRelation
}

type HiredEmployee = {
  userId: string
  username: string | null
  displayName: string | null
}

type FriendLists = {
  friends: UserPreview[]
  incoming: UserPreview[]
  outgoing: UserPreview[]
}

type TelegramIdentity = {
  userId: string
  username: string | null
  displayName: string | null
}

type AvatarModelId = 'classic' | 'minimal_long_hair'

type AvatarModelDef = {
  id: AvatarModelId
  name: string
  description: string
}

type HomeBackgroundId = 'none' | 'apartment_sunrise' | 'apartment_midnight'

type HomeBackgroundDef = {
  id: Exclude<HomeBackgroundId, 'none'>
  name: string
  description: string
  imageSrc: string
}

type NightStarDef = {
  left: string
  top: string
  size: number
  delay: string
  duration: string
  opacity: number
}

type SlotRewardDef = {
  cardId: string
  slotName: string
  inventoryName: string
  imageSrc: string
}

type ReelState = {
  track: SlotRewardDef[]
  offset: number
  durationMs: number
}

type BusinessProfile = {
  name: string
  description: string
  capital: string
}

type BusinessMode = 'none' | 'owner' | 'employee'

type BusinessOwnerPreview = {
  userId: string
  username: string | null
  displayName: string | null
}

type BusinessStaffSlot = {
  slotIndex: number
  roleName: string
  userId: string | null
  username: string | null
  displayName: string | null
}

type BusinessAssignment = {
  slotIndex: number
  roleName: string
}

type BusinessPayload = {
  mode: BusinessMode
  business: BusinessProfile | null
  stars?: string
  owner: BusinessOwnerPreview | null
  staff: BusinessStaffSlot[]
  assignment: BusinessAssignment | null
}

type PublicUserProfile = {
  userId: string
  username: string | null
  displayName: string | null
  stars: string
  avatarModel: AvatarModelId
}

type FriendProfileState = {
  preview: UserPreview
  profile: PublicUserProfile | null
  business: BusinessPayload | null
  hasApartment: boolean
}

type PackRewardResult =
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

type CustomizeCategoryId = 'pose' | 'headwear' | 'build' | 'hair' | 'face' | 'item'

type CustomizeCategoryDef = {
  id: CustomizeCategoryId
  label: string
  description: string
  placement:
    | 'top'
    | 'topRight'
    | 'right'
    | 'bottomRight'
    | 'bottomLeft'
    | 'left'
  Icon: ComponentType<{ className?: string }>
}

const SEEDED_STAR_BALANCES: Record<string, string> = {
  '5651149188': '9999999999',
}

const APARTMENT_CARD_ID = 'asset_apartment'
const BUSINESS_OPEN_COST = 100_000
const BUSINESS_START_CAPITAL = 80_000
const BUSINESS_CLICK_DOUBLE_THRESHOLD = 150_000
const BUSINESS_EMPLOYEE_CLICK_STARS = 5
const BUSINESS_OWNER_CLICK_STARS = 1
const BUSINESS_CAPITAL_CLICK_STARS = 1
const PACK_COOLDOWN_MS = 12 * 60 * 60 * 1000
const SLOT_SPIN_COST = 100
const SLOT_JACKPOT_STARS = 10_000
const BUSINESS_SLOT_COUNT = 6
const SLOT_REEL_TURNS = 14
const LOCAL_INVENTORY_RESET_VERSION = 2
const DEFAULT_BUSINESS_ROLES = [
  'Управляющий',
  'Консультант',
  'Кассир',
  'Маркетолог',
  'Логист',
  'Ассистент',
] as const
const LEGACY_PACK_CARD_IDS = [
  'rose_red',
  'rose_white',
  'knife_kitchen',
  'log',
  'axe_noir',
  'axe',
  'rose_2red',
  'rose_bouquet',
] as const

const HOME_BACKGROUNDS: HomeBackgroundDef[] = [
  {
    id: 'apartment_sunrise',
    name: 'Светлая квартира',
    description: 'Тёплая гостиная с большим окном и мягким дневным светом.',
    imageSrc: '/home-bg-apartment-sunrise.svg',
  },
  {
    id: 'apartment_midnight',
    name: 'Ночной лофт',
    description: 'Темный интерьер квартиры с ночным городом за панорамным окном.',
    imageSrc: '/home-bg-apartment-midnight.svg',
  },
]

const AVATAR_MODELS: AvatarModelDef[] = [
  {
    id: 'classic',
    name: 'Классическая',
    description: 'Текущий минималистичный человечек из игры без волос.',
  },
  {
    id: 'minimal_long_hair',
    name: 'С длинными волосами',
    description: 'Новая минималистичная моделька с длинными волосами и тонким силуэтом.',
  },
]

const NIGHT_LOFT_STARS: NightStarDef[] = [
  { left: '22%', top: '18%', size: 3, delay: '0s', duration: '2.1s', opacity: 0.78 },
  { left: '28%', top: '28%', size: 2, delay: '0.4s', duration: '1.8s', opacity: 0.62 },
  { left: '36%', top: '22%', size: 2, delay: '0.8s', duration: '2.4s', opacity: 0.86 },
  { left: '44%', top: '16%', size: 3, delay: '1.2s', duration: '2s', opacity: 0.74 },
  { left: '53%', top: '26%', size: 2, delay: '0.25s', duration: '2.3s', opacity: 0.66 },
  { left: '61%', top: '19%', size: 2, delay: '1.6s', duration: '1.9s', opacity: 0.72 },
  { left: '69%', top: '27%', size: 3, delay: '0.65s', duration: '2.2s', opacity: 0.8 },
  { left: '76%', top: '18%', size: 2, delay: '1.1s', duration: '1.7s', opacity: 0.7 },
  { left: '82%', top: '24%', size: 2, delay: '0.95s', duration: '2.5s', opacity: 0.64 },
  { left: '72%', top: '33%', size: 3, delay: '1.35s', duration: '2.1s', opacity: 0.82 },
  { left: '58%', top: '34%', size: 2, delay: '0.55s', duration: '1.85s', opacity: 0.68 },
  { left: '33%', top: '35%', size: 2, delay: '1.8s', duration: '2.35s', opacity: 0.76 },
]

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

const PACK_CARDS: CardDef[] = [
  { id: 'rose_red', name: 'Красная Роза', imageSrc: '/card-rose.png' },
  { id: 'rose_white', name: 'Белая Роза', imageSrc: '/card-rose-white.png' },
  { id: 'knife_kitchen', name: 'Кухонный нож', imageSrc: '/card-knife-kitchen.png' },
  { id: 'log', name: 'Бревно', imageSrc: '/card-log.png' },
  { id: 'axe_noir', name: 'Топор нуар', imageSrc: '/card-axe-noir.png' },
  { id: 'axe', name: 'Топор', imageSrc: '/card-axe.png' },
]

const ALL_CARDS: CardDef[] = [
  { id: APARTMENT_CARD_ID, name: 'Квартира', imageSrc: '/home-bg-apartment-sunrise.svg' },
  ...PACK_CARDS,
  { id: 'rose_2red', name: '2 красные розы', imageSrc: '/card-rose-2red.png' },
  { id: 'rose_bouquet', name: 'Букет красных роз', imageSrc: '/card-rose-bouquet.png' },
]

const MERGE_RESULTS: Record<string, string> = {
  'rose_red|rose_red': 'rose_2red',
  'rose_red|rose_2red': 'rose_bouquet',
  'rose_2red|rose_red': 'rose_bouquet',
}

function pickRandomSlotReward(): SlotRewardDef {
  return SLOT_REWARDS[Math.floor(Math.random() * SLOT_REWARDS.length)]
}

function createIdleReelState(reward: SlotRewardDef): ReelState {
  return {
    track: [reward],
    offset: 0,
    durationMs: 0,
  }
}

function buildReelState(finalReward: SlotRewardDef, durationMs: number): ReelState {
  const track = Array.from({ length: SLOT_REEL_TURNS }, () => pickRandomSlotReward())
  track.push(finalReward)
  return {
    track,
    offset: track.length - 1,
    durationMs,
  }
}

function findMergeResult(a: string, b: string): string | null {
  const key = [a, b].sort().join('|')
  return MERGE_RESULTS[key] ?? null
}

function getUserId(): string {
  const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id
  if (typeof tgId === 'number' && Number.isFinite(tgId)) return String(tgId)
  let anon = localStorage.getItem('anon_user_id')
  if (!anon) {
    anon = crypto.randomUUID()
    localStorage.setItem('anon_user_id', anon)
  }
  return `anon_${anon}`
}

function isAnonymousUserId(userId: string): boolean {
  return userId.startsWith('anon_')
}

function areTelegramIdentitiesEqual(a: TelegramIdentity, b: TelegramIdentity): boolean {
  return a.userId === b.userId && a.username === b.username && a.displayName === b.displayName
}

function getTelegramIdentity(userId: string): TelegramIdentity {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user
  const username =
    typeof tgUser?.username === 'string' && tgUser.username.trim().length > 0
      ? tgUser.username.trim()
      : null
  const displayName = [tgUser?.first_name, tgUser?.last_name]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .trim() || null

  return {
    userId,
    username,
    displayName,
  }
}

function getUserPrimaryLabel(user: { userId: string | null; username: string | null; displayName: string | null }) {
  if (user.username) return `@${user.username}`
  if (user.displayName) return user.displayName
  return user.userId ? `ID ${user.userId}` : 'Не назначен'
}

function getUserSecondaryLabel(user: { userId: string | null; username: string | null; displayName: string | null }) {
  if (user.username && user.displayName) return user.displayName
  return user.userId ? `ID ${user.userId}` : 'Свободный слот'
}

function getRelationLabel(relation: FriendRelation): string {
  switch (relation) {
    case 'friend':
      return 'Друг'
    case 'incoming':
      return 'Входящая заявка'
    case 'outgoing':
      return 'Исходящая заявка'
    case 'self':
      return 'Это вы'
    default:
      return 'Не в друзьях'
  }
}

type LocalInventory = Record<string, number>

function loadLocalInventory(userId: string): LocalInventory {
  try {
    const raw = localStorage.getItem(`inventory_${userId}`)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as LocalInventory
  } catch {
    return {}
  }
}

function saveLocalInventory(userId: string, inv: LocalInventory) {
  try {
    localStorage.setItem(`inventory_${userId}`, JSON.stringify(inv))
  } catch {
    // ignore
  }
}

function upsertLocalCard(userId: string, cardId: string, qty: number) {
  const inv = loadLocalInventory(userId)
  inv[cardId] = (inv[cardId] ?? 0) + qty
  saveLocalInventory(userId, inv)
}

function removeLocalCard(userId: string, cardId: string, count: number) {
  const inv = loadLocalInventory(userId)
  const cur = inv[cardId] ?? 0
  inv[cardId] = Math.max(0, cur - count)
  if (inv[cardId] === 0) delete inv[cardId]
  saveLocalInventory(userId, inv)
}

function loadLocalStars(userId: string): string {
  try {
    const raw = localStorage.getItem(`stars_${userId}`)
    if (!raw) return '0'
    const normalized = raw.trim()
    return /^\d+$/.test(normalized) ? normalized : '0'
  } catch {
    return '0'
  }
}

function saveLocalStars(userId: string, stars: string) {
  try {
    localStorage.setItem(`stars_${userId}`, stars)
  } catch {
    // ignore
  }
}

function loadLocalPackNextOpenAt(userId: string): number | null {
  try {
    const raw = localStorage.getItem(`pack_next_open_at_${userId}`)
    if (!raw) return null
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

function saveLocalPackNextOpenAt(userId: string, nextOpenAt: number | null) {
  try {
    if (!nextOpenAt) {
      localStorage.removeItem(`pack_next_open_at_${userId}`)
      return
    }
    localStorage.setItem(`pack_next_open_at_${userId}`, String(nextOpenAt))
  } catch {
    // ignore
  }
}

function pickLocalPackReward(): PackRewardResult {
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

function resolveAvatarModelId(value: string | null | undefined): AvatarModelId {
  return AVATAR_MODELS.some((model) => model.id === value)
    ? (value as AvatarModelId)
    : 'classic'
}

function getAvatarModelById(modelId: AvatarModelId): AvatarModelDef {
  return AVATAR_MODELS.find((model) => model.id === modelId) ?? AVATAR_MODELS[0]
}

function loadAvatarModel(userId: string): AvatarModelId {
  try {
    const raw = localStorage.getItem(`avatar_model_${userId}`)
    return resolveAvatarModelId(raw)
  } catch {
    return 'classic'
  }
}

function saveAvatarModel(userId: string, modelId: AvatarModelId) {
  try {
    localStorage.setItem(`avatar_model_${userId}`, modelId)
  } catch {
    // ignore
  }
}

function ensureLocalInventoryMigration(userId: string) {
  try {
    const versionKey = `inventory_reset_version_${userId}`
    const currentVersion = Number(localStorage.getItem(versionKey) ?? '0')
    const current = loadLocalInventory(userId)
    let changed = false

    for (const cardId of LEGACY_PACK_CARD_IDS) {
      if (current[cardId]) {
        delete current[cardId]
        changed = true
      }
    }

    if (changed || currentVersion < LOCAL_INVENTORY_RESET_VERSION) {
      saveLocalInventory(userId, current)
    }

    localStorage.setItem(versionKey, String(LOCAL_INVENTORY_RESET_VERSION))
  } catch {
    saveLocalInventory(userId, {})
  }
}

function getHomeBackgroundById(backgroundId: HomeBackgroundId): HomeBackgroundDef | null {
  return HOME_BACKGROUNDS.find((background) => background.id === backgroundId) ?? null
}

function loadHomeBackground(userId: string): HomeBackgroundId {
  try {
    const raw = localStorage.getItem(`home_background_${userId}`)
    if (!raw) return 'none'
    return HOME_BACKGROUNDS.some((background) => background.id === raw)
      ? (raw as HomeBackgroundId)
      : 'none'
  } catch {
    return 'none'
  }
}

function saveHomeBackground(userId: string, backgroundId: HomeBackgroundId) {
  try {
    if (backgroundId === 'none') {
      localStorage.removeItem(`home_background_${userId}`)
      return
    }
    localStorage.setItem(`home_background_${userId}`, backgroundId)
  } catch {
    // ignore
  }
}

function loadLocalBusiness(userId: string): BusinessProfile | null {
  try {
    const raw = localStorage.getItem(`business_profile_${userId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const business = parsed as Partial<BusinessProfile>
    if (typeof business.name !== 'string' || typeof business.description !== 'string' || typeof business.capital !== 'string') {
      return null
    }
    return {
      name: business.name,
      description: business.description,
      capital: business.capital,
    }
  } catch {
    return null
  }
}

function saveLocalBusiness(userId: string, business: BusinessProfile) {
  try {
    localStorage.setItem(`business_profile_${userId}`, JSON.stringify(business))
  } catch {
    // ignore
  }
}

type BusinessTeamState = (HiredEmployee | null)[]

function getDefaultBusinessRole(slotIndex: number): string {
  return DEFAULT_BUSINESS_ROLES[slotIndex] ?? `Сотрудник ${slotIndex + 1}`
}

function createEmptyBusinessStaff(): BusinessStaffSlot[] {
  return Array.from({ length: BUSINESS_SLOT_COUNT }, (_, slotIndex) => ({
    slotIndex,
    roleName: getDefaultBusinessRole(slotIndex),
    userId: null,
    username: null,
    displayName: null,
  }))
}

function normalizeBusinessStaff(staff: unknown): BusinessStaffSlot[] {
  if (!Array.isArray(staff)) return createEmptyBusinessStaff()

  const byIndex = new Map<number, BusinessStaffSlot>()
  for (const entry of staff) {
    if (!entry || typeof entry !== 'object') continue
    const slot = entry as Partial<BusinessStaffSlot>
    const slotIndex = Number(slot.slotIndex)
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= BUSINESS_SLOT_COUNT) continue
    byIndex.set(slotIndex, {
      slotIndex,
      roleName: typeof slot.roleName === 'string' && slot.roleName.trim().length > 0
        ? slot.roleName.trim()
        : getDefaultBusinessRole(slotIndex),
      userId: typeof slot.userId === 'string' && slot.userId.trim().length > 0 ? slot.userId : null,
      username: typeof slot.username === 'string' && slot.username.trim().length > 0 ? slot.username : null,
      displayName: typeof slot.displayName === 'string' && slot.displayName.trim().length > 0 ? slot.displayName : null,
    })
  }

  return createEmptyBusinessStaff().map((slot) => byIndex.get(slot.slotIndex) ?? slot)
}

function loadLocalBusinessStaff(userId: string): BusinessStaffSlot[] {
  try {
    const raw = localStorage.getItem(`business_staff_${userId}`)
    if (raw) {
      return normalizeBusinessStaff(JSON.parse(raw) as unknown)
    }
  } catch {
    // ignore
  }

  const legacyTeam = loadBusinessTeam(userId)
  return createEmptyBusinessStaff().map((slot, index) => {
    const legacy = legacyTeam[index]
    if (!legacy) return slot
    return {
      ...slot,
      userId: legacy.userId,
      username: legacy.username,
      displayName: legacy.displayName,
    }
  })
}

function saveLocalBusinessStaff(userId: string, staff: BusinessStaffSlot[]) {
  try {
    localStorage.setItem(`business_staff_${userId}`, JSON.stringify(staff))
  } catch {
    // ignore
  }
}

function createLocalBusinessPayload(userId: string, business: BusinessProfile | null): BusinessPayload {
  return {
    mode: business ? 'owner' : 'none',
    business,
    stars: getFallbackStars(userId),
    owner: business
      ? {
          userId,
          username: null,
          displayName: null,
        }
      : null,
    staff: business ? loadLocalBusinessStaff(userId) : createEmptyBusinessStaff(),
    assignment: null,
  }
}

function loadBusinessTeam(userId: string): BusinessTeamState {
  try {
    const raw = localStorage.getItem(`business_team_${userId}`)
    if (!raw) return Array.from({ length: BUSINESS_SLOT_COUNT }, () => null)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return Array.from({ length: BUSINESS_SLOT_COUNT }, () => null)
    return Array.from({ length: BUSINESS_SLOT_COUNT }, (_, index) => {
      const entry = parsed[index]
      if (!entry || typeof entry !== 'object') return null
      const employee = entry as Partial<HiredEmployee>
      return typeof employee.userId === 'string'
        ? {
            userId: employee.userId,
            username: typeof employee.username === 'string' ? employee.username : null,
            displayName: typeof employee.displayName === 'string' ? employee.displayName : null,
          }
        : null
    })
  } catch {
    return Array.from({ length: BUSINESS_SLOT_COUNT }, () => null)
  }
}

function getFallbackStars(userId: string): string {
  const local = loadLocalStars(userId)
  const seeded = SEEDED_STAR_BALANCES[userId]
  if (!seeded) return local
  return Number(local) > Number(seeded) ? local : seeded
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function restoreBusinessFromLocal(userId: string, business: BusinessProfile) {
  try {
    const r = await fetchWithTimeout('/api/business', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId,
        name: business.name,
        description: business.description,
        restore: true,
      }),
    })

    const data = (await r.json().catch(() => null)) as BusinessPayload | null

    if (!r.ok) return null

    return {
      mode: data?.mode ?? 'owner',
      business: data?.business ?? {
        name: business.name,
        description: business.description,
        capital: String(BUSINESS_START_CAPITAL),
      },
      stars: typeof data?.stars === 'string' ? data.stars : undefined,
      owner: data?.owner ?? {
        userId,
        username: null,
        displayName: null,
      },
      staff: normalizeBusinessStaff(data?.staff),
      assignment: data?.assignment ?? null,
    } satisfies BusinessPayload
  } catch {
    return null
  }
}

function formatStars(stars: string): string {
  const numeric = Number(stars)
  if (!Number.isFinite(numeric)) return stars
  return new Intl.NumberFormat('ru-RU').format(numeric)
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

function getEmployeeBusinessClickReward(currentCapital: string | number) {
  const numericCapital = Number(currentCapital)
  const capital = Number.isFinite(numericCapital) && numericCapital >= 0 ? numericCapital : 0
  const multiplier = capital >= BUSINESS_CLICK_DOUBLE_THRESHOLD ? 2 : 1

  return {
    workerStars: BUSINESS_EMPLOYEE_CLICK_STARS * multiplier,
    ownerStars: BUSINESS_OWNER_CLICK_STARS * multiplier,
    businessCapital: BUSINESS_CAPITAL_CLICK_STARS * multiplier,
  }
}

const chromaKeyCache = new Map<string, string>()

function ChromaKeyImage({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const cached = chromaKeyCache.get(src)
  const [outSrc, setOutSrc] = useState<string | null>(cached ?? null)

  useEffect(() => {
    const cached = chromaKeyCache.get(src)
    if (cached) {
      setOutSrc(cached)
      return
    }
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.src = src
    img.onload = () => {
      if (cancelled) return
      const canvas = document.createElement('canvas')
      const w = img.naturalWidth || img.width
      const h = img.naturalHeight || img.height
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, w, h)
      const data = imageData.data

      // sample background from corners (assumes mostly uniform)
      const sample = (x: number, y: number) => {
        const i = (y * w + x) * 4
        return [data[i], data[i + 1], data[i + 2]] as const
      }
      const s1 = sample(0, 0)
      const s2 = sample(w - 1, 0)
      const s3 = sample(0, h - 1)
      const s4 = sample(w - 1, h - 1)
      const bg = [
        Math.round((s1[0] + s2[0] + s3[0] + s4[0]) / 4),
        Math.round((s1[1] + s2[1] + s3[1] + s4[1]) / 4),
        Math.round((s1[2] + s2[2] + s3[2] + s4[2]) / 4),
      ] as const

      const thr0 = 36 // fully transparent threshold
      const thr1 = 120 // fully opaque threshold
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const dr = r - bg[0]
        const dg = g - bg[1]
        const db = b - bg[2]
        const dist = Math.sqrt(dr * dr + dg * dg + db * db)
        if (dist <= thr0) {
          data[i + 3] = 0
        } else if (dist < thr1) {
          const t = (dist - thr0) / (thr1 - thr0)
          data[i + 3] = Math.round(data[i + 3] * t)
        }
      }
      ctx.putImageData(imageData, 0, 0)
      const url = canvas.toDataURL('image/png')
      chromaKeyCache.set(src, url)
      setOutSrc(url)
    }
    img.onerror = () => {
      if (!cancelled) setOutSrc(null)
    }
    return () => {
      cancelled = true
    }
  }, [src])

  return <img className={className} src={outSrc ?? src} alt={alt} />
}

function PackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="presentation" aria-hidden="true">
      <g transform="rotate(-18 32 32)">
        {/* teeth top */}
        <path
          d="M14 14 L18 10 L22 14 L26 10 L30 14 L34 10 L38 14 L42 10 L46 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* pack body */}
        <path
          d="M18 14 H46
             C48.8 14 51 16.2 51 19
             V51
             C51 53.8 48.8 56 46 56
             H18
             C15.2 56 13 53.8 13 51
             V19
             C13 16.2 15.2 14 18 14 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />

        {/* seal lines */}
        <path
          d="M16 20 H48"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M16 50 H48"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          opacity="0.9"
        />

        {/* teeth bottom */}
        <path
          d="M14 56 L18 60 L22 56 L26 60 L30 56 L34 60 L38 56 L42 60 L46 56"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* glossy highlight */}
        <path
          d="M24 23 C21 31 21 42 24 50"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.28"
        />

        {/* card hint */}
        <path
          d="M28 26 H38
             C39.1 26 40 26.9 40 28
             V38
             C40 39.1 39.1 40 38 40
             H28
             C26.9 40 26 39.1 26 38
             V28
             C26 26.9 26.9 26 28 26 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
          opacity="0.55"
        />
      </g>
    </svg>
  )
}

function RouletteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="presentation" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 16h24a8 8 0 0 1 8 8v24a10 10 0 0 1-10 10H20A10 10 0 0 1 10 48V24a8 8 0 0 1 8-8Z" />
        <path d="M18 16v-6h16" opacity="0.72" />
        <path d="M51 26h3c2.8 0 5 2.2 5 5v4c0 2.8-2.2 5-5 5h-3" />
        <path d="m56 22 4-4" />
        <rect x="16" y="24" width="9" height="16" rx="2.5" />
        <rect x="27.5" y="24" width="9" height="16" rx="2.5" />
        <rect x="39" y="24" width="9" height="16" rx="2.5" />
        <path d="M20.5 32h.01M32 32h.01M43.5 32h.01" strokeWidth="4" />
        <path d="M19 48h22" opacity="0.72" />
      </g>
    </svg>
  )
}

function GardenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="presentation" aria-hidden="true">
      <g stroke="currentColor" fill="none" strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round">
        <rect x="10" y="18" width="44" height="30" rx="8" />
        <path d="M22 18v-4.5A5.5 5.5 0 0 1 27.5 8h9A5.5 5.5 0 0 1 42 13.5V18" />
        <path d="M18 29h28" opacity="0.75" />
        <path d="M20 38h6M30 38h4M38 38h6" opacity="0.9" />
        <path d="M16 52h32" opacity="0.65" />
      </g>
    </svg>
  )
}

function StarsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="presentation" aria-hidden="true">
      <path
        fill="currentColor"
        d="M32 6 L38 26 L58 32 L38 38 L32 58 L26 38 L6 32 L26 26 Z"
      />
    </svg>
  )
}

function CoinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="presentation" aria-hidden="true">
      <circle cx="32" cy="32" r="22" fill="#fbfbfb" stroke="#090909" strokeWidth="3" />
      <circle cx="32" cy="32" r="15.5" fill="none" stroke="#1a1a1a" strokeWidth="2.6" />
      <path d="M26 32h12" fill="none" stroke="#090909" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M32 26v12" fill="none" stroke="#090909" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M22 18c3-2.8 6.8-4 10-4" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" opacity="0.92" />
    </svg>
  )
}

function BusinessInfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="presentation" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 54V19.5c0-2.5 2-4.5 4.5-4.5h15c2.5 0 4.5 2 4.5 4.5V54" />
        <path d="M16 54h32" />
        <path d="M26 24h3M35 24h3M26 31h3M35 31h3M26 38h3M35 38h3" />
        <circle cx="50" cy="18" r="7.5" />
        <path d="M50 15v6M50 28h.01" />
      </g>
    </svg>
  )
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function InventoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <path d="M4 8.5h16v10A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5zM7 8.5V6.8A1.8 1.8 0 0 1 8.8 5h6.4A1.8 1.8 0 0 1 17 6.8v1.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9.2 12h5.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function FriendsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <circle cx="9" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="10.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 18.5c.6-2.6 2.6-4 5.2-4s4.7 1.4 5.3 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15.2 17.5c.4-1.7 1.7-2.7 3.5-2.7 1 0 1.9.3 2.6.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CustomizeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <path d="M12 4.5 13.7 8l3.8.6-2.7 2.6.6 3.8-3.4-1.8-3.4 1.8.6-3.8L6.5 8.6l3.8-.6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M18 18.5h.01M6 18.5h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function AddFriendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <path d="M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-4.5 6c.6-2.4 2.4-3.7 4.5-3.7s3.9 1.3 4.5 3.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 8v6M14 11h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <path d="M8 16c0-1.7 1.3-3 3-3h7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m14 7 4 6-4 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 7.5h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m15 15 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function PoseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <circle cx="12" cy="5.25" r="2.15" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.9v4.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 10.5 7.7 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 10.8 16.9 8.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 12.3 8.6 19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 12.3 16.9 17.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function HeadwearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <path
        d="M6 11.2c.45-3.15 2.75-5.2 6-5.2s5.55 2.05 6 5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4.4 11.9c1.7-.9 4.12-1.35 7.6-1.35 3.48 0 5.9.45 7.6 1.35"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7.4 11.5v2.2c0 1.25 1.98 2.3 4.6 2.3s4.6-1.05 4.6-2.3v-2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M9.1 8.4h5.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function BuildIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <circle cx="12" cy="5.4" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8.6 11.1c0-1.55 1.53-2.8 3.4-2.8s3.4 1.25 3.4 2.8v5.15c0 1.67-1.53 3.02-3.4 3.02s-3.4-1.35-3.4-3.02z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M8.8 12.3H6.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17.7 12.3h-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function HairIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <path
        d="M6.6 11.9V9.8c0-3.02 2.42-5.48 5.4-5.48 2.98 0 5.4 2.46 5.4 5.48v2.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7.35 9.6c1.3-.85 2.55-1.72 3.8-2.6.62 1.2 1.92 1.98 3.96 2.33"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8.4 13.7c.8 1.55 2.05 2.3 3.6 2.3s2.8-.75 3.6-2.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function FaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <circle cx="12" cy="12" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9.4" cy="10.6" r="0.95" fill="currentColor" />
      <circle cx="14.6" cy="10.6" r="0.95" fill="currentColor" />
      <path d="M8.9 14.1c.8 1.15 1.85 1.7 3.1 1.7s2.3-.55 3.1-1.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ItemIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="presentation" aria-hidden="true">
      <path
        d="M8.9 7.2 16.7 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M8.15 8.15 6.3 5.7a1.65 1.65 0 0 1 2.34-2.34l2.46 1.85"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="m13.2 11.45 5.2 5.2a2.15 2.15 0 1 1-3.04 3.04l-5.2-5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ClassicStickman() {
  return (
    <svg
      className="stickman"
      viewBox="0 0 240 320"
      role="img"
      aria-label="Человечек"
    >
      {/* красивый минималистичный силуэт */}
      <g className="stickmanSilhouette stickmanFloat">
        {/* голова + лицо (анимируются вместе) */}
        <g className="stickmanHead">
          <circle className="stickmanPart" cx="120" cy="56" r="32" />
          <circle className="stickmanCut" cx="109" cy="52" r="4.8" />
          <circle className="stickmanCut" cx="131" cy="52" r="4.8" />
          <rect className="stickmanCut" x="107" y="68" width="26" height="6" rx="3" />
        </g>

        {/* руки (капли) под ~45° к телу */}
        <g transform="translate(0 -12) translate(90 120) rotate(20) scale(0.82 1) translate(-90 -120)">
          <g className="stickmanArmLeft">
            <path
              className="stickmanPart"
              d="
                M 92 108
                C 70 126 60 154 64 182
                C 68 212 92 224 104 206
                C 116 188 100 172 102 150
                C 104 128 116 118 128 112
                C 116 122 102 128 92 108
                Z
              "
            />
          </g>
        </g>
        <g transform="translate(0 -12) translate(150 120) rotate(-20) scale(0.82 1) translate(-150 -120)">
          <g className="stickmanArmRight">
            <path
              className="stickmanPart"
              d="
                M 148 108
                C 170 126 180 154 176 182
                C 172 212 148 224 136 206
                C 124 188 140 172 138 150
                C 136 128 124 118 112 112
                C 124 122 138 128 148 108
                Z
              "
            />
          </g>
        </g>

        {/* плечевой "мост" без "кругов" по бокам */}
        <rect className="stickmanPart" x="92" y="97" width="56" height="22" rx="10" />

        {/* туловище: верх на уровне плеч, низ без изменений */}
        <rect className="stickmanPart" x="92" y="97" width="56" height="97" rx="26" />

        {/* переход таза: сглаживает стык туловища и ног (ноги не меняем) */}
        <path
          className="stickmanPart"
          d="
            M 92 168
            L 148 168
            C 148 184 150 190 150 192
            Q 120 210 90 192
            C 90 190 92 184 92 168
            Z
          "
        />

        {/* ноги (капли) — раздвинутые, не расширенные */}
        <g transform="translate(8 0)">
          <path
            className="stickmanPart stickmanLegLeft"
            d="
              M 90 192
              Q 116 176 142 192
              C 156 220 158 248 156 286
              C 154 308 134 314 120 298
              C 104 280 114 258 118 238
              C 124 210 106 198 90 192
              Z
            "
          />
        </g>
        <g transform="translate(-8 0)">
          <path
            className="stickmanPart stickmanLegRight"
            d="
              M 150 192
              Q 124 176 98 192
              C 84 220 82 248 84 286
              C 86 308 106 314 120 298
              C 136 280 126 258 122 238
              C 116 210 134 198 150 192
              Z
            "
          />
        </g>
      </g>
    </svg>
  )
}

function LongHairStickman() {
  return (
    <svg
      className="stickman"
      viewBox="0 0 240 320"
      role="img"
      aria-label="Человечек с длинными волосами"
    >
      <g className="stickmanSilhouette stickmanFloat">
        <path
          className="stickmanHair"
          d="
            M 82 58
            C 82 24 100 8 120 8
            C 140 8 158 24 158 58
            L 158 124
            C 158 138 163 149 166 160
            C 169 171 165 178 156 182
            C 148 186 140 182 136 174
            C 132 163 126 149 121 132
            L 119 132
            C 114 149 108 163 104 174
            C 100 182 92 186 84 182
            C 75 178 71 171 74 160
            C 77 149 82 138 82 124
            Z
          "
        />
        <path
          className="stickmanOutline"
          d="
            M 82 58
            C 82 24 100 8 120 8
            C 140 8 158 24 158 58
            L 158 124
            C 158 138 163 149 166 160
            C 169 171 165 178 156 182
            C 148 186 140 182 136 174
            C 132 163 126 149 121 132
            L 119 132
            C 114 149 108 163 104 174
            C 100 182 92 186 84 182
            C 75 178 71 171 74 160
            C 77 149 82 138 82 124
            Z
          "
        />

        <g className="stickmanHead">
          <ellipse className="stickmanPart" cx="120" cy="56" rx="29" ry="32" />
          <path
            className="stickmanOutline"
            d="
              M 91 56
              A 29 32 0 0 0 149 56
            "
          />
          <path
            className="stickmanCut"
            d="
              M 119 24
              C 116 36 108 48 92 58
            "
            stroke="var(--bg)"
            strokeWidth="2.6"
            strokeLinecap="round"
            fill="none"
          />
          <path
            className="stickmanCut"
            d="
              M 121 24
              C 124 36 132 48 148 58
            "
            stroke="var(--bg)"
            strokeWidth="2.6"
            strokeLinecap="round"
            fill="none"
          />
          <circle className="stickmanCut" cx="109" cy="52" r="4.8" />
          <circle className="stickmanCut" cx="131" cy="52" r="4.8" />
          <rect className="stickmanCut" x="110" y="69" width="20" height="4.4" rx="2.2" />
        </g>

        <g transform="translate(4 -10) translate(96 120) rotate(17) scale(0.68 1) translate(-96 -120)">
          <g className="stickmanArmLeft">
            <path
              className="stickmanPart"
              d="
                M 92 108
                C 70 126 60 154 64 182
                C 68 212 92 224 104 206
                C 116 188 100 172 102 150
                C 104 128 116 118 128 112
                C 116 122 102 128 92 108
                Z
              "
            />
            <path
              className="stickmanOutline"
              d="
                M 84 122
                C 68 140 60 160 64 182
                C 68 212 92 224 104 206
                C 116 188 100 172 102 150
                C 103 136 108 126 118 118
              "
            />
          </g>
        </g>
        <g transform="translate(-4 -10) translate(144 120) rotate(-17) scale(0.68 1) translate(-144 -120)">
          <g className="stickmanArmRight">
            <path
              className="stickmanPart"
              d="
                M 148 108
                C 170 126 180 154 176 182
                C 172 212 148 224 136 206
                C 124 188 140 172 138 150
                C 136 128 124 118 112 112
                C 124 122 138 128 148 108
                Z
              "
            />
            <path
              className="stickmanOutline"
              d="
                M 156 122
                C 172 140 180 160 176 182
                C 172 212 148 224 136 206
                C 124 188 140 172 138 150
                C 137 136 132 126 122 118
              "
            />
          </g>
        </g>

        <rect className="stickmanPart" x="98" y="97" width="44" height="20" rx="9" />
        <path
          className="stickmanOutline"
          d="
            M 107 97
            L 133 97
          "
        />
        <path
          className="stickmanPart"
          d="
            M 99 108
            C 99 120 99 132 100 144
            L 100 170
            C 100 182 94 188 88 192
            Q 120 212 152 192
            C 146 188 140 182 140 170
            L 140 144
            C 141 132 141 120 141 108
            C 141 102 139 98 135 98
            L 105 98
            C 101 98 99 102 99 108
            Z
          "
        />
        <path
          className="stickmanOutline"
          d="
            M 100 126
            C 100 132 100 138 100 144
            L 100 170
            C 100 182 94 188 88 192
            Q 120 212 152 192
            C 146 188 140 182 140 170
            L 140 144
            C 140 138 140 132 140 126
          "
        />

        <g transform="translate(6 0)">
          <path
            className="stickmanPart stickmanLegLeft"
            d="
              M 90 192
              Q 116 176 142 192
              C 156 220 158 248 156 286
              C 154 308 134 314 120 298
              C 104 280 114 258 118 238
              C 124 210 106 198 90 192
              Z
            "
          />
        </g>
        <g transform="translate(-6 0)">
          <path
            className="stickmanPart stickmanLegRight"
            d="
              M 150 192
              Q 124 176 98 192
              C 84 220 82 248 84 286
              C 86 308 106 314 120 298
              C 136 280 126 258 122 238
              C 116 210 134 198 150 192
              Z
            "
          />
        </g>
      </g>
    </svg>
  )
}

function Stickman({ modelId = 'classic' }: { modelId?: AvatarModelId }) {
  if (modelId === 'minimal_long_hair') {
    return <LongHairStickman />
  }

  return <ClassicStickman />
}

const LONG_PRESS_MS = 420
const LONG_PRESS_MOVE_PX = 12
const AUTO_SCROLL_EDGE_PX = 72
const AUTO_SCROLL_MAX_STEP = 18

function InventoryPanel({
  inventory,
  userId,
  onReload,
  onItemTap,
}: {
  inventory: InventoryItem[]
  userId: string
  onReload: () => void
  onItemTap?: (item: InventoryItem) => void
}) {
  const [draggingItem, setDraggingItem] = useState<InventoryItem | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [activePointerId, setActivePointerId] = useState<number | null>(null)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const downPosRef = useRef({ x: 0, y: 0 })
  const pointerPosRef = useRef({ x: 0, y: 0 })
  const activeCardRef = useRef<HTMLDivElement | null>(null)
  const pendingItemRef = useRef<InventoryItem | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const lastDropTargetRef = useRef<string | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const autoScrollSpeedRef = useRef(0)

  const clearLongPress = useCallback(() => {
    if (!longPressRef.current) return
    clearTimeout(longPressRef.current)
    longPressRef.current = null
  }, [])

  const stopAutoScroll = useCallback(() => {
    autoScrollSpeedRef.current = 0
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
  }, [])

  const cleanupPointerSession = useCallback(() => {
    const pointerId = pointerIdRef.current
    if (pointerId !== null && activeCardRef.current?.hasPointerCapture?.(pointerId)) {
      try {
        activeCardRef.current.releasePointerCapture(pointerId)
      } catch {
        // ignore
      }
    }
    document.body.classList.remove('inventoryDragActive')
    pointerIdRef.current = null
    pendingItemRef.current = null
    activeCardRef.current = null
    lastDropTargetRef.current = null
    stopAutoScroll()
    setActivePointerId(null)
  }, [stopAutoScroll])

  const updateDropTargetAtPoint = useCallback((clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY)
    const card = el?.closest('[data-inventory-card-id]')
    const next = card?.getAttribute('data-inventory-card-id') ?? null
    if (next !== lastDropTargetRef.current) {
      lastDropTargetRef.current = next
      setDropTargetId(next)
    }
  }, [])

  const updateAutoScrollSpeed = useCallback((clientX: number, clientY: number) => {
    const panel = panelRef.current
    if (!panel || !draggingItem) {
      stopAutoScroll()
      return
    }

    const rect = panel.getBoundingClientRect()
    const insideX = clientX >= rect.left && clientX <= rect.right
    if (!insideX) {
      stopAutoScroll()
      return
    }

    let nextSpeed = 0
    const topDistance = clientY - rect.top
    const bottomDistance = rect.bottom - clientY
    const canScrollUp = panel.scrollTop > 0
    const canScrollDown = panel.scrollTop + panel.clientHeight < panel.scrollHeight - 1

    if (topDistance >= 0 && topDistance < AUTO_SCROLL_EDGE_PX && canScrollUp) {
      const intensity = 1 - topDistance / AUTO_SCROLL_EDGE_PX
      nextSpeed = -Math.max(4, Math.round(intensity * AUTO_SCROLL_MAX_STEP))
    } else if (bottomDistance >= 0 && bottomDistance < AUTO_SCROLL_EDGE_PX && canScrollDown) {
      const intensity = 1 - bottomDistance / AUTO_SCROLL_EDGE_PX
      nextSpeed = Math.max(4, Math.round(intensity * AUTO_SCROLL_MAX_STEP))
    }

    autoScrollSpeedRef.current = nextSpeed
    if (nextSpeed === 0 || autoScrollFrameRef.current !== null) return

    const tick = () => {
      const currentPanel = panelRef.current
      if (!currentPanel || !draggingItem || autoScrollSpeedRef.current === 0) {
        stopAutoScroll()
        return
      }

      const prevScrollTop = currentPanel.scrollTop
      currentPanel.scrollTop += autoScrollSpeedRef.current
      updateDropTargetAtPoint(pointerPosRef.current.x, pointerPosRef.current.y)

      if (currentPanel.scrollTop === prevScrollTop) {
        stopAutoScroll()
        return
      }

      autoScrollFrameRef.current = requestAnimationFrame(tick)
    }

    autoScrollFrameRef.current = requestAnimationFrame(tick)
  }, [draggingItem, stopAutoScroll, updateDropTargetAtPoint])

  const applyMerge = useCallback(
    (cardA: string, cardB: string, resultId: string) => {
      removeLocalCard(userId, cardA, 1)
      removeLocalCard(userId, cardB, 1)
      upsertLocalCard(userId, resultId, 1)
      onReload()
      fetch('/api/inventory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          merge: { from: [cardA, cardB], to: resultId },
        }),
      })
        .then(() => onReload())
        .catch(() => {})
    },
    [userId, onReload]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, item: InventoryItem) => {
      if (draggingItem || pointerIdRef.current !== null) return
      downPosRef.current = { x: e.clientX, y: e.clientY }
      pointerPosRef.current = { x: e.clientX, y: e.clientY }
      pointerIdRef.current = e.pointerId
      pendingItemRef.current = item
      activeCardRef.current = e.currentTarget
      setActivePointerId(e.pointerId)
      longPressRef.current = window.setTimeout(() => {
        longPressRef.current = null
        lastDropTargetRef.current = null
        setDropTargetId(null)
        pointerPosRef.current = { x: downPosRef.current.x, y: downPosRef.current.y }
        const pointerId = pointerIdRef.current
        const nextItem = pendingItemRef.current
        if (pointerId === null || !nextItem) return
        if (activeCardRef.current) {
          try {
            activeCardRef.current.setPointerCapture(pointerId)
          } catch {
            // ignore
          }
        }
        document.body.classList.add('inventoryDragActive')
        setDraggingItem(nextItem)
      }, LONG_PRESS_MS)
    },
    [draggingItem]
  )

  const handleDocumentPointerMove = useCallback(
    (e: PointerEvent) => {
      if (e.pointerId !== pointerIdRef.current) return
      pointerPosRef.current = { x: e.clientX, y: e.clientY }
      if (!draggingItem) {
        if (!longPressRef.current) return
        const dx = e.clientX - downPosRef.current.x
        const dy = e.clientY - downPosRef.current.y
        if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) {
          clearLongPress()
          pendingItemRef.current = null
        }
        return
      }

      e.preventDefault()
      const g = ghostRef.current
      if (g) {
        g.style.left = `${e.clientX}px`
        g.style.top = `${e.clientY}px`
      }
      updateDropTargetAtPoint(e.clientX, e.clientY)
      updateAutoScrollSpeed(e.clientX, e.clientY)
    },
    [clearLongPress, draggingItem, updateAutoScrollSpeed, updateDropTargetAtPoint]
  )

  const handleDocumentPointerUp = useCallback(
    (e: PointerEvent) => {
      if (e.pointerId !== pointerIdRef.current) return
      clearLongPress()
      if (!draggingItem) {
        const tappedItem = pendingItemRef.current
        cleanupPointerSession()
        if (tappedItem) {
          onItemTap?.(tappedItem)
        }
        return
      }
      const targetId = dropTargetId
      const src = draggingItem
      setDraggingItem(null)
      setDropTargetId(null)
      cleanupPointerSession()
      if (!targetId || targetId === src.id) return
      const targetItem = inventory.find((i) => i.id === targetId)
      if (!targetItem) return
      const result = findMergeResult(src.cardId, targetItem.cardId)
      if (!result) return
      applyMerge(src.cardId, targetItem.cardId, result)
    },
    [applyMerge, cleanupPointerSession, clearLongPress, draggingItem, dropTargetId, inventory, onItemTap]
  )

  useEffect(() => {
    if (activePointerId === null) return
    const handleDocumentPointerCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerIdRef.current) return
      clearLongPress()
      setDraggingItem(null)
      setDropTargetId(null)
      cleanupPointerSession()
    }

    document.addEventListener('pointermove', handleDocumentPointerMove, { passive: false })
    document.addEventListener('pointerup', handleDocumentPointerUp)
    document.addEventListener('pointercancel', handleDocumentPointerCancel)

    return () => {
      document.removeEventListener('pointermove', handleDocumentPointerMove)
      document.removeEventListener('pointerup', handleDocumentPointerUp)
      document.removeEventListener('pointercancel', handleDocumentPointerCancel)
    }
  }, [activePointerId, cleanupPointerSession, clearLongPress, handleDocumentPointerMove, handleDocumentPointerUp])

  useEffect(() => {
    if (!draggingItem) return
    const preventTouchScroll = (e: TouchEvent) => {
      e.preventDefault()
    }
    document.addEventListener('touchmove', preventTouchScroll, { passive: false })
    return () => {
      document.removeEventListener('touchmove', preventTouchScroll)
    }
  }, [draggingItem])

  useEffect(() => {
    return () => {
      clearLongPress()
      cleanupPointerSession()
    }
  }, [cleanupPointerSession, clearLongPress])

  if (inventory.length === 0) {
    return (
      <section className="panel">
        <h2>Инвентарь</h2>
        <p>Пока пусто.</p>
      </section>
    )
  }

  return (
    <section ref={panelRef} className="panel">
      <h2>Инвентарь</h2>
      <p className="inventoryHint">Зажмите и перетащите на другой предмет для слияния</p>
      <div className="inventoryGrid" role="list">
        {inventory.map((item) => (
          <div
            key={item.id}
            className={`inventoryCard ${draggingItem?.id === item.id ? 'inventoryCardDragging' : ''} ${dropTargetId === item.id ? 'inventoryCardDropTarget' : ''}`}
            role="listitem"
            data-inventory-card-id={item.id}
            onPointerDown={(e) => handlePointerDown(e, item)}
          >
            <div className="inventoryThumb" aria-hidden="true">
              <ChromaKeyImage
                className="inventoryThumbImg"
                src={item.imageSrc}
                alt=""
              />
            </div>
            <div className="inventoryName">{item.name}</div>
          </div>
        ))}
      </div>
      {draggingItem && (
        <div
          ref={ghostRef}
          className="inventoryDragGhost"
          style={{
            left: pointerPosRef.current.x,
            top: pointerPosRef.current.y,
          }}
        >
          <div className="inventoryThumb">
            <ChromaKeyImage
              className="inventoryThumbImg"
              src={draggingItem.imageSrc}
              alt=""
            />
          </div>
          <div className="inventoryName">{draggingItem.name}</div>
        </div>
      )}
    </section>
  )
}

function getTransferableCards(inventory: InventoryItem[]): { cardId: string; name: string; imageSrc: string; count: number }[] {
  const grouped = new Map<string, { cardId: string; name: string; imageSrc: string; count: number }>()
  for (const item of inventory) {
    const existing = grouped.get(item.cardId)
    if (existing) {
      existing.count += 1
      continue
    }
    grouped.set(item.cardId, {
      cardId: item.cardId,
      name: item.name,
      imageSrc: item.imageSrc,
      count: 1,
    })
  }
  return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

function normalizeUserSearch(term: string): string {
  const trimmed = term.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('@') ? trimmed.slice(1).trim() : trimmed
}

function FriendsPanel({
  userId,
  inventory,
  onReloadInventory,
}: {
  userId: string
  inventory: InventoryItem[]
  onReloadInventory: () => Promise<void> | void
}) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserPreview[]>([])
  const [lists, setLists] = useState<FriendLists>({ friends: [], incoming: [], outgoing: [] })
  const [notice, setNotice] = useState<string | null>(null)
  const [loadingLists, setLoadingLists] = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [transferTarget, setTransferTarget] = useState<UserPreview | null>(null)
  const [profileTarget, setProfileTarget] = useState<UserPreview | null>(null)
  const [profileState, setProfileState] = useState<FriendProfileState | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const profileRequestIdRef = useRef(0)

  const transferableCards = useMemo(() => getTransferableCards(inventory), [inventory])

  const loadFriendLists = useCallback(async () => {
    setLoadingLists(true)
    try {
      const r = await fetchWithTimeout(`/api/friends?userId=${encodeURIComponent(userId)}`)
      if (!r.ok) throw new Error('Не удалось загрузить друзей')
      const data = (await r.json()) as FriendLists
      setLists(data)
    } catch {
      setNotice('Не удалось загрузить список друзей')
    } finally {
      setLoadingLists(false)
    }
  }, [userId])

  const runSearch = useCallback(async (term: string) => {
    const trimmed = normalizeUserSearch(term)
    if (!trimmed) {
      setSearchResults([])
      setLoadingSearch(false)
      return
    }
    setLoadingSearch(true)
    try {
      const r = await fetchWithTimeout(`/api/users?userId=${encodeURIComponent(userId)}&query=${encodeURIComponent(trimmed)}`)
      if (!r.ok) throw new Error('Поиск недоступен')
      const data = (await r.json()) as { users: UserPreview[] }
      setSearchResults(data.users ?? [])
    } catch {
      setSearchResults([])
      setNotice('Не удалось выполнить поиск профиля')
    } finally {
      setLoadingSearch(false)
    }
  }, [userId])

  useEffect(() => {
    void loadFriendLists()
  }, [loadFriendLists])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void runSearch(query)
    }, 220)
    return () => window.clearTimeout(timeout)
  }, [query, runSearch])

  const refreshAll = useCallback(async () => {
    await loadFriendLists()
    if (query.trim()) {
      await runSearch(query)
    }
  }, [loadFriendLists, query, runSearch])

  const handleAdd = useCallback(async (target: UserPreview) => {
    setBusyUserId(target.userId)
    setNotice(null)
    try {
      const r = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'request',
          userId,
          targetUserId: target.userId,
        }),
      })
      const data = await r.json().catch(() => null) as { error?: string } | null
      if (!r.ok) throw new Error(data?.error ?? 'Не удалось отправить заявку')
      setNotice(target.relation === 'incoming' ? 'Заявка принята' : 'Заявка отправлена')
      await refreshAll()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось отправить заявку')
    } finally {
      setBusyUserId(null)
    }
  }, [refreshAll, userId])

  const handleSendItem = useCallback(async (cardId: string) => {
    if (!transferTarget) return
    setBusyUserId(transferTarget.userId)
    setNotice(null)
    try {
      const r = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'send_item',
          userId,
          targetUserId: transferTarget.userId,
          cardId,
        }),
      })
      const data = await r.json().catch(() => null) as { error?: string } | null
      if (!r.ok) throw new Error(data?.error ?? 'Не удалось отправить предмет')
      setNotice(`Предмет отправлен ${getUserPrimaryLabel(transferTarget)}`)
      setTransferTarget(null)
      await onReloadInventory()
      await refreshAll()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось отправить предмет')
    } finally {
      setBusyUserId(null)
    }
  }, [onReloadInventory, refreshAll, transferTarget, userId])

  const handleOpenProfile = useCallback(async (target: UserPreview) => {
    const requestId = profileRequestIdRef.current + 1
    profileRequestIdRef.current = requestId
    setProfileTarget(target)
    setProfileState({
      preview: target,
      profile: null,
      business: null,
      hasApartment: false,
    })
    setProfileError(null)
    setLoadingProfile(true)

    const [profileData, businessData, inventoryData] = await Promise.all([
      fetchWithTimeout(`/api/profile?userId=${encodeURIComponent(target.userId)}`)
        .then(async (response) => {
          if (!response.ok) return null
          return await response.json() as PublicUserProfile
        })
        .catch(() => null),
      fetchWithTimeout(`/api/business?userId=${encodeURIComponent(target.userId)}`)
        .then(async (response) => {
          if (!response.ok) return null
          return await response.json() as BusinessPayload
        })
        .catch(() => null),
      fetchWithTimeout(`/api/inventory?userId=${encodeURIComponent(target.userId)}`)
        .then(async (response) => {
          if (!response.ok) return null
          return await response.json() as { items?: { card_id: string }[] }
        })
        .catch(() => null),
    ])

    if (profileRequestIdRef.current !== requestId) return

    const hasApartment = Boolean(inventoryData?.items?.some((item) => item.card_id === APARTMENT_CARD_ID))

    setProfileState({
      preview: target,
      profile: profileData,
      business: businessData,
      hasApartment,
    })
    setProfileError(profileData || businessData || inventoryData ? null : 'Не удалось загрузить профиль пользователя')
    setLoadingProfile(false)
  }, [])

  const closeProfile = useCallback(() => {
    profileRequestIdRef.current += 1
    setProfileTarget(null)
    setProfileState(null)
    setProfileError(null)
    setLoadingProfile(false)
  }, [])

  const renderUserRow = (user: UserPreview, options?: { compact?: boolean }) => {
    const canAdd = user.relation === 'none' || user.relation === 'incoming'
    const canSend = transferableCards.length > 0
    const addTitle =
      user.relation === 'incoming'
        ? 'Принять заявку'
        : user.relation === 'outgoing'
          ? 'Заявка уже отправлена'
          : user.relation === 'friend'
            ? 'Уже в друзьях'
            : 'Добавить в друзья'

    return (
      <div
        key={`${options?.compact ? 'compact' : 'full'}-${user.userId}`}
        className="friendRow isClickable"
        role="button"
        tabIndex={0}
        onClick={() => void handleOpenProfile(user)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            void handleOpenProfile(user)
          }
        }}
      >
        <div className="friendMeta">
          <div className="friendPrimary">{getUserPrimaryLabel(user)}</div>
          <div className="friendSecondary">{getUserSecondaryLabel(user)}</div>
        </div>
        <div className="friendActions">
          <button
            type="button"
            className={`friendActionButton ${canAdd ? '' : 'isDisabled'}`}
            onClick={(e) => {
              e.stopPropagation()
              if (canAdd) void handleAdd(user)
            }}
            disabled={!canAdd || busyUserId === user.userId}
            title={addTitle}
            aria-label={addTitle}
          >
            <AddFriendIcon />
          </button>
          <button
            type="button"
            className={`friendActionButton ${canSend ? '' : 'isDisabled'}`}
            onClick={(e) => {
              e.stopPropagation()
              if (canSend) setTransferTarget(user)
            }}
            disabled={!canSend || busyUserId === user.userId}
            title={canSend ? 'Отправить предмет' : 'Нет предметов для отправки'}
            aria-label={canSend ? 'Отправить предмет' : 'Нет предметов для отправки'}
          >
            <ShareIcon />
          </button>
        </div>
      </div>
    )
  }

  const showSearchResults = normalizeUserSearch(query).length > 0

  return (
    <section className="panel friendsPanel">
      <div className="friendsHeader">
        <h2>Друзья</h2>
        <div className="friendsHeaderIcon" aria-hidden="true">
          <FriendsIcon />
        </div>
      </div>
      <p className="friendsHint">Ищите по Telegram ID или username. Можно отправить заявку в друзья и переслать предмет.</p>

      <label className="friendsSearch">
        <SearchIcon className="friendsSearchIcon" />
        <input
          className="friendsSearchInput"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по ID, username или @username"
          autoComplete="off"
        />
      </label>

      {notice && <div className="friendsNotice">{notice}</div>}

      {showSearchResults ? (
        <div className="friendsSection">
          <div className="friendsSectionTitle">Результаты поиска</div>
          {loadingSearch ? (
            <div className="friendsEmpty">Ищем профиль...</div>
          ) : searchResults.length > 0 ? (
            <div className="friendList">{searchResults.map((user) => renderUserRow(user))}</div>
          ) : (
            <div className="friendsEmpty">Ничего не найдено. Человек должен быть зарегистрирован в базе.</div>
          )}
        </div>
      ) : (
        <div className="friendsStack">
          <div className="friendsSection">
            <div className="friendsSectionTitle">Входящие заявки</div>
            {lists.incoming.length > 0 ? (
              <div className="friendList">{lists.incoming.map((user) => renderUserRow(user, { compact: true }))}</div>
            ) : (
              <div className="friendsEmpty">{loadingLists ? 'Загружаем заявки...' : 'Пока нет входящих заявок'}</div>
            )}
          </div>

          <div className="friendsSection">
            <div className="friendsSectionTitle">Друзья</div>
            {lists.friends.length > 0 ? (
              <div className="friendList">{lists.friends.map((user) => renderUserRow(user, { compact: true }))}</div>
            ) : (
              <div className="friendsEmpty">{loadingLists ? 'Загружаем друзей...' : 'Список друзей пока пуст'}</div>
            )}
          </div>

          <div className="friendsSection">
            <div className="friendsSectionTitle">Исходящие заявки</div>
            {lists.outgoing.length > 0 ? (
              <div className="friendList">{lists.outgoing.map((user) => renderUserRow(user, { compact: true }))}</div>
            ) : (
              <div className="friendsEmpty">{loadingLists ? 'Загружаем заявки...' : 'Исходящих заявок пока нет'}</div>
            )}
          </div>
        </div>
      )}

      {transferTarget && (
        <div className="friendTransferOverlay" onClick={() => setTransferTarget(null)}>
          <div className="friendTransferModal" onClick={(e) => e.stopPropagation()}>
            <div className="friendTransferHeader">
              <h3>Отправить предмет</h3>
              <button
                type="button"
                className="friendTransferClose"
                onClick={() => setTransferTarget(null)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <p className="friendTransferTarget">{getUserPrimaryLabel(transferTarget)}</p>
            {transferableCards.length > 0 ? (
              <div className="friendTransferGrid">
                {transferableCards.map((card) => (
                  <button
                    key={card.cardId}
                    type="button"
                    className="friendTransferItem"
                    onClick={() => void handleSendItem(card.cardId)}
                  >
                    <div className="friendTransferThumb">
                      <ChromaKeyImage className="friendTransferImg" src={card.imageSrc} alt="" />
                    </div>
                    <div className="friendTransferName">{card.name}</div>
                    <div className="friendTransferCount">x{card.count}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="friendsEmpty">В инвентаре нет предметов для отправки.</div>
            )}
          </div>
        </div>
      )}

      {profileTarget && (
        <div className="friendProfileOverlay" onClick={closeProfile}>
          <div className="friendProfileModal" onClick={(e) => e.stopPropagation()}>
            <div className="friendProfileHeader">
              <div>
                <h3>Профиль</h3>
                <p className="friendProfileHint">Домашняя страница пользователя.</p>
              </div>
              <button
                type="button"
                className="friendTransferClose"
                onClick={closeProfile}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            {loadingProfile ? (
              <div className="friendsEmpty">Загружаем профиль...</div>
            ) : (
              <>
                <div className={`friendProfileStage ${profileState?.hasApartment ? 'hasBackground' : ''}`}>
                  {profileState?.hasApartment && (
                    <>
                      <div
                        className="friendProfileBackdrop"
                        style={{ backgroundImage: `url(${HOME_BACKGROUNDS[0]?.imageSrc ?? ''})` }}
                        aria-hidden="true"
                      />
                      <div className="friendProfileBackdropShade" aria-hidden="true" />
                    </>
                  )}
                  <div className="friendProfileAvatarWrap">
                    <Stickman modelId={resolveAvatarModelId(profileState?.profile?.avatarModel)} />
                  </div>
                </div>

                <div className="friendProfileSummary">
                  <div className="friendProfileEyebrow">{getRelationLabel(profileState?.preview.relation ?? profileTarget.relation)}</div>
                  <div className="friendProfileName">{getUserPrimaryLabel(profileState?.profile ?? profileTarget)}</div>
                  <div className="friendProfileSecondary">{getUserSecondaryLabel(profileState?.profile ?? profileTarget)}</div>
                </div>

                <div className="friendProfileGrid">
                  <div className="friendProfileCard">
                    <span className="friendProfileLabel">Баланс</span>
                    <strong className="friendProfileValue">
                      {profileState?.profile ? `${formatStars(profileState.profile.stars)} звёзд` : 'Неизвестно'}
                    </strong>
                  </div>

                  <div className="friendProfileCard">
                    <span className="friendProfileLabel">Жильё</span>
                    <strong className="friendProfileValue">
                      {profileState?.hasApartment ? 'Квартира' : 'Стандартная сцена'}
                    </strong>
                  </div>

                  <div className="friendProfileCard isWide">
                    <span className="friendProfileLabel">Бизнес</span>
                    <strong className="friendProfileValue">
                      {profileState?.business?.business
                        ? profileState.business.business.name
                        : 'Бизнес не открыт'}
                    </strong>
                    {profileState?.business?.business && (
                      <span className="friendProfileSubvalue">
                        {profileState.business.mode === 'owner'
                          ? `Владелец, капитал ${formatStars(profileState.business.business.capital)}`
                          : profileState.business.assignment
                            ? `${profileState.business.assignment.roleName}, капитал ${formatStars(profileState.business.business.capital)}`
                            : `Сотрудник, капитал ${formatStars(profileState.business.business.capital)}`}
                      </span>
                    )}
                  </div>
                </div>

                {profileError && <div className="friendsNotice">{profileError}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

const CUSTOMIZE_CATEGORIES: CustomizeCategoryDef[] = [
  {
    id: 'pose',
    label: 'Поза',
    description: 'Выбирайте стойку и настроение персонажа для главной сцены.',
    placement: 'top',
    Icon: PoseIcon,
  },
  {
    id: 'headwear',
    label: 'Головные уборы',
    description: 'Кепки, шляпы и другие акценты для верхней части образа.',
    placement: 'topRight',
    Icon: HeadwearIcon,
  },
  {
    id: 'build',
    label: 'Моделька',
    description: 'Здесь будут собираться варианты базовой модельки персонажа и её силуэта.',
    placement: 'right',
    Icon: BuildIcon,
  },
  {
    id: 'item',
    label: 'Предмет',
    description: 'Аксессуары и предметы в руках персонажа для бизнес-сцены.',
    placement: 'bottomRight',
    Icon: ItemIcon,
  },
  {
    id: 'face',
    label: 'Лицо',
    description: 'Настраивайте эмоции, взгляд и детали лица персонажа.',
    placement: 'bottomLeft',
    Icon: FaceIcon,
  },
  {
    id: 'hair',
    label: 'Прически',
    description: 'Подберите стиль волос и общую подачу образа.',
    placement: 'left',
    Icon: HairIcon,
  },
]

function loadCustomizeCategory(userId: string): CustomizeCategoryId {
  try {
    const raw = localStorage.getItem(`customize_category_${userId}`)
    return CUSTOMIZE_CATEGORIES.some((category) => category.id === raw)
      ? (raw as CustomizeCategoryId)
      : 'pose'
  } catch {
    return 'pose'
  }
}

function saveCustomizeCategory(userId: string, categoryId: CustomizeCategoryId) {
  try {
    localStorage.setItem(`customize_category_${userId}`, categoryId)
  } catch {
    // ignore
  }
}

function CustomizePanel({
  userId,
  selectedAvatarModelId,
  onSelectAvatarModel,
}: {
  userId: string
  selectedAvatarModelId: AvatarModelId
  onSelectAvatarModel: (modelId: AvatarModelId) => void
}) {
  const [activeCategoryId, setActiveCategoryId] = useState<CustomizeCategoryId>(() => loadCustomizeCategory(userId))

  useEffect(() => {
    setActiveCategoryId(loadCustomizeCategory(userId))
  }, [userId])

  useEffect(() => {
    saveCustomizeCategory(userId, activeCategoryId)
  }, [activeCategoryId, userId])
  const activeCategory = CUSTOMIZE_CATEGORIES.find((category) => category.id === activeCategoryId) ?? CUSTOMIZE_CATEGORIES[0]
  const selectedAvatarModel = getAvatarModelById(selectedAvatarModelId)
  const showModelPicker = activeCategory.id === 'build'

  return (
    <section className="panel customizePanel">
      <div className="customizePanelHeader">
        <div>
          <h2>Кастомизация</h2>
          <p className="customizeHint">По центру ваш человечек, а вокруг быстрые разделы внешнего вида.</p>
        </div>
      </div>

      <div className="customizeStudio">
        <div className="customizeStudioGlow" aria-hidden="true" />
        <div className="customizeOrbit">
          {CUSTOMIZE_CATEGORIES.map((category) => {
            const isActive = category.id === activeCategory.id
            const Icon = category.Icon

            return (
              <button
                key={category.id}
                type="button"
                className={`customizeAction customizeAction--${category.placement} ${isActive ? 'isActive' : ''}`}
                onClick={() => setActiveCategoryId(category.id)}
                aria-pressed={isActive}
              >
                <span className="customizeActionIcon">
                  <Icon />
                </span>
                <span className="customizeActionLabel">{category.label}</span>
              </button>
            )
          })}

          <div className="customizeAvatarStage">
            <div className="customizeAvatarHalo" aria-hidden="true" />
            <div className="customizeAvatarCard">
              <Stickman modelId={selectedAvatarModelId} />
            </div>
            <div className="customizeAvatarMeta">
              <span className="customizeAvatarEyebrow">Персонаж</span>
              <span className="customizeAvatarName">{selectedAvatarModel.name}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="customizeSelectionCard">
        <div className="customizeSelectionEyebrow">Раздел</div>
        <div className="customizeSelectionTitle">{activeCategory.label}</div>
        <p className="customizeSelectionText">{activeCategory.description}</p>
      </div>

      {showModelPicker && (
        <div className="customizeModelGrid">
          {AVATAR_MODELS.map((model) => {
            const isActive = model.id === selectedAvatarModelId
            return (
              <button
                key={model.id}
                type="button"
                className={`avatarModelCard ${isActive ? 'isActive' : ''}`}
                onClick={() => onSelectAvatarModel(model.id)}
                aria-pressed={isActive}
              >
                <div className="avatarModelPreview">
                  <Stickman modelId={model.id} />
                </div>
                <div className="avatarModelMeta">
                  <div className="avatarModelNameRow">
                    <span className="avatarModelName">{model.name}</span>
                    {isActive && <span className="avatarModelBadge">Выбрана</span>}
                  </div>
                  <span className="avatarModelDescription">{model.description}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <p className="customizeSubnote">Темы квартиры и другие активы остаются в инвентаре через предметы.</p>
    </section>
  )
}

function ApartmentThemeModal({
  selectedBackgroundId,
  onSelectBackground,
  onClose,
}: {
  selectedBackgroundId: HomeBackgroundId
  onSelectBackground: (backgroundId: HomeBackgroundId) => void
  onClose: () => void
}) {
  return (
    <div className="apartmentThemeOverlay" onClick={onClose}>
      <div className="apartmentThemeModal" onClick={(e) => e.stopPropagation()}>
        <div className="apartmentThemeHeader">
          <div>
            <h3>Квартира</h3>
            <p className="apartmentThemeHint">Выберите тему своей квартиры для главной страницы.</p>
          </div>
          <button
            type="button"
            className="friendTransferClose"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="customizeGrid">
          {HOME_BACKGROUNDS.map((background) => {
            const isActive = selectedBackgroundId === background.id
            return (
              <button
                key={background.id}
                type="button"
                className={`backgroundCard ${isActive ? 'isActive' : ''}`}
                onClick={() => onSelectBackground(background.id)}
                aria-pressed={isActive}
              >
                <div
                  className="backgroundPreview"
                  style={{ backgroundImage: `url(${background.imageSrc})` }}
                  aria-hidden="true"
                >
                  <div className="backgroundPreviewShade" />
                  <div className="backgroundPreviewFigure" />
                </div>
                <div className="backgroundMeta">
                  <div className="backgroundNameRow">
                    <span className="backgroundName">{background.name}</span>
                    {isActive && <span className="backgroundBadge">Выбрана</span>}
                  </div>
                  <span className="backgroundDescription">{background.description}</span>
                </div>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          className="customizeReset"
          onClick={() => onSelectBackground('none')}
          disabled={selectedBackgroundId === 'none'}
        >
          Убрать тему квартиры
        </button>
      </div>
    </div>
  )
}

function SlotsModal({
  userId,
  stars,
  onClose,
  onStarsChange,
}: {
  userId: string
  stars: string
  onClose: () => void
  onStarsChange: (nextStars: string) => void
}) {
  const [reelStates, setReelStates] = useState<ReelState[]>(() => [
    createIdleReelState(pickRandomSlotReward()),
    createIdleReelState(pickRandomSlotReward()),
    createIdleReelState(pickRandomSlotReward()),
  ])
  const [isSpinning, setIsSpinning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const timersRef = useRef<number[]>([])
  const animationFrameRef = useRef<number | null>(null)

  const clearSpinTimers = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    for (const timerId of timersRef.current) {
      window.clearTimeout(timerId)
      window.clearInterval(timerId)
    }
    timersRef.current = []
  }, [])

  useEffect(() => {
    return () => {
      clearSpinTimers()
    }
  }, [clearSpinTimers])

  const finalizeLocalSpin = useCallback((nextStars: string) => {
    saveLocalStars(userId, nextStars)
  }, [userId])

  const requestSpin = useCallback(async () => {
    try {
      const r = await fetch('/api/slots', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await r.json().catch(() => null) as
        | { error?: string; stars?: string; rewards?: SlotRewardDef[]; jackpot?: boolean }
        | null
      if (!r.ok) {
        if (r.status === 400 && data?.error) {
          throw new Error(data.error)
        }
        throw new Error('__SLOTS_LOCAL_FALLBACK__')
      }
      const rewards = Array.isArray(data?.rewards) ? data.rewards : [pickRandomSlotReward(), pickRandomSlotReward(), pickRandomSlotReward()]
      const nextStars = typeof data?.stars === 'string' ? data.stars : stars
      saveLocalStars(userId, nextStars)
      return { rewards, nextStars }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message !== '__SLOTS_LOCAL_FALLBACK__' &&
        !/Failed to fetch|NetworkError|fetch/i.test(error.message)
      ) {
        throw error
      }
      const currentStars = Number(stars)
      if (!Number.isFinite(currentStars) || currentStars < SLOT_SPIN_COST) {
        throw new Error('Недостаточно звёзд для прокрута')
      }
      const rewards = [pickRandomSlotReward(), pickRandomSlotReward(), pickRandomSlotReward()]
      const isJackpot = rewards.every((reward) => reward.cardId === rewards[0].cardId)
      const nextStars = String(
        Math.max(0, currentStars - SLOT_SPIN_COST + (isJackpot ? SLOT_JACKPOT_STARS : 0))
      )
      finalizeLocalSpin(nextStars)
      return { rewards, nextStars }
    }
  }, [finalizeLocalSpin, stars, userId])

  const runSpinAnimation = useCallback((finalRewards: SlotRewardDef[]) => {
    clearSpinTimers()
    setStatus(null)
    setIsSpinning(true)

    const initialStates = finalRewards.map((reward) => {
      const reel = buildReelState(reward, 0)
      return {
        track: reel.track,
        offset: 0,
        durationMs: 0,
      }
    })

    const animatedStates = initialStates.map((state, index) => ({
      ...state,
      offset: state.track.length - 1,
      durationMs: 1350 + index * 560,
    }))

    setReelStates(initialStates)

    animationFrameRef.current = requestAnimationFrame(() => {
      setReelStates(animatedStates)
    })

    const finishTimerId = window.setTimeout(() => {
      setIsSpinning(false)
    }, Math.max(...animatedStates.map((state) => state.durationMs)) + 140)

    timersRef.current.push(finishTimerId)
  }, [clearSpinTimers])

  const handleSpin = useCallback(async () => {
    if (isSpinning) return
    setStatus(null)
    try {
      const { rewards, nextStars } = await requestSpin()
      onStarsChange(nextStars)
      runSpinAnimation(rewards)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось прокрутить рулетку')
    }
  }, [isSpinning, onStarsChange, requestSpin, runSpinAnimation])

  const currentStars = Number(stars)
  const canSpin = Number.isFinite(currentStars) && currentStars >= SLOT_SPIN_COST && !isSpinning

  return (
    <div
      className="slotsModalOverlay"
      role="presentation"
      onClick={() => {
        if (!isSpinning) onClose()
      }}
    >
      <div
        className="slotsModal"
        role="dialog"
        aria-modal="true"
        aria-label="Слот-казино"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="slotsHeader">
          <div>
            <h3>Слот-казино</h3>
            <p className="slotsSubtext">1 прокрут стоит {SLOT_SPIN_COST} звёзд</p>
          </div>
          <button
            type="button"
            className="slotsClose"
            onClick={onClose}
            disabled={isSpinning}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="slotsBalance">
          <StarsIcon className="slotsBalanceIcon" />
          <span>{formatStars(stars)}</span>
        </div>

        <div className={`slotsMachine ${isSpinning ? 'isSpinning' : ''}`}>
          <div className="slotsMachineGlow" aria-hidden="true" />
          <div className="slotsReels">
            {reelStates.map((reelState, index) => (
              <div key={`reel-${index}`} className="slotReel">
                <div className="slotReelWindow">
                  <div
                    className="slotReelTrack"
                    style={{
                      transform: `translateY(calc(-1 * var(--slot-reel-item-size) * ${reelState.offset}))`,
                      transitionDuration: `${reelState.durationMs}ms`,
                    }}
                  >
                    {reelState.track.map((reward, rewardIndex) => (
                      <div key={`${index}-${reward.cardId}-${rewardIndex}`} className="slotReelCard">
                        <div className="slotReelThumb">
                          <ChromaKeyImage className="slotReelImg" src={reward.imageSrc} alt="" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="slotReelShade isTop" aria-hidden="true" />
                  <div className="slotReelShade isBottom" aria-hidden="true" />
                </div>
              </div>
            ))}
          </div>
          <div className="slotsMachineFooter">Роза • 2 розы • 3 розы • Белая роза • Нож</div>
        </div>

        <button
          type="button"
          className="slotsSpinButton"
          onClick={() => void handleSpin()}
          disabled={!canSpin}
        >
          {isSpinning ? 'Прокрут...' : `Крутить за ${SLOT_SPIN_COST}`}
        </button>

        {status && <div className="slotsStatus">{status}</div>}

      </div>
    </div>
  )
}

function ClickerModal({
  userId,
  stars,
  businessMode,
  businessProfile,
  onClose,
  onStarsChange,
  onBusinessChange,
}: {
  userId: string
  stars: string
  businessMode: BusinessMode
  businessProfile: BusinessProfile | null
  onClose: () => void
  onStarsChange: (nextStars: string) => void
  onBusinessChange?: (nextBusiness: BusinessProfile | null) => void
}) {
  const [status, setStatus] = useState<string | null>(null)
  const [tapBurst, setTapBurst] = useState(0)
  const [tapFloats, setTapFloats] = useState<{ id: number; drift: number; value: number }[]>([])
  const latestStarsRef = useRef(stars)
  const latestBusinessRef = useRef<BusinessProfile | null>(businessProfile)
  const queuedDeltaRef = useRef(0)
  const syncingRef = useRef(false)
  const resetBurstTimerRef = useRef<number | null>(null)
  const floatTimersRef = useRef<number[]>([])
  const floatIdRef = useRef(0)
  const emitStarsChange = useEffectEvent((nextStars: string) => {
    onStarsChange(nextStars)
  })
  const emitBusinessChange = useEffectEvent((nextBusiness: BusinessProfile | null) => {
    onBusinessChange?.(nextBusiness)
  })
  const flushQueuedStars = useEffectEvent(async () => {
    if (syncingRef.current || queuedDeltaRef.current === 0) return
    syncingRef.current = true

    const delta = queuedDeltaRef.current
    queuedDeltaRef.current = 0

    try {
      const r = await fetchWithTimeout('/api/stars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, delta }),
      })
      const data = (await r.json().catch(() => null)) as { error?: string; stars?: string; businessCapital?: string } | null
      if (r.ok && typeof data?.stars === 'string') {
        latestStarsRef.current = data.stars
        saveLocalStars(userId, data.stars)
        emitStarsChange(data.stars)
        if (typeof data.businessCapital === 'string' && latestBusinessRef.current) {
          const nextBusiness = {
            ...latestBusinessRef.current,
            capital: data.businessCapital,
          }
          latestBusinessRef.current = nextBusiness
          emitBusinessChange(nextBusiness)
        }
        setStatus(null)
      } else if (data?.error) {
        setStatus(data.error)
      }
    } catch {
      setStatus('Звёзды засчитаны локально. Синхронизируем с сервером позже.')
    } finally {
      syncingRef.current = false
      if (queuedDeltaRef.current > 0) {
        void flushQueuedStars()
      }
    }
  })

  useEffect(() => {
    latestStarsRef.current = stars
  }, [stars])

  useEffect(() => {
    latestBusinessRef.current = businessProfile
  }, [businessProfile])

  useEffect(() => {
    return () => {
      if (resetBurstTimerRef.current !== null) {
        window.clearTimeout(resetBurstTimerRef.current)
      }
      for (const timerId of floatTimersRef.current) {
        window.clearTimeout(timerId)
      }
      floatTimersRef.current = []
    }
  }, [])

  const activeEmployeeReward = businessMode === 'employee' && businessProfile
    ? getEmployeeBusinessClickReward(businessProfile.capital)
    : null
  const clickDescription = activeEmployeeReward
    ? [
        `1 клик сейчас приносит вам +${activeEmployeeReward.workerStars}, владельцу +${activeEmployeeReward.ownerStars}, а капиталу бизнеса +${activeEmployeeReward.businessCapital}.`,
        Number(businessProfile?.capital ?? '0') < BUSINESS_CLICK_DOUBLE_THRESHOLD
          ? `После ${formatStars(String(BUSINESS_CLICK_DOUBLE_THRESHOLD))} капитала выплаты удвоятся.`
          : 'Бизнес уже вышел на усиленные выплаты.',
      ].join(' ')
    : '1 клик сейчас приносит +1 звезду на ваш баланс.'

  const handleTap = useCallback(() => {
    const activeBusiness = businessMode === 'employee' ? latestBusinessRef.current : null
    const reward = activeBusiness ? getEmployeeBusinessClickReward(activeBusiness.capital) : null
    const workerReward = reward?.workerStars ?? 1
    const capitalReward = reward?.businessCapital ?? 0
    const nextStars = String(Math.max(0, Number(latestStarsRef.current) + workerReward))
    latestStarsRef.current = nextStars
    saveLocalStars(userId, nextStars)
    emitStarsChange(nextStars)
    if (activeBusiness && capitalReward > 0) {
      const nextBusiness = {
        ...activeBusiness,
        capital: String(Math.max(0, Number(activeBusiness.capital) + capitalReward)),
      }
      latestBusinessRef.current = nextBusiness
      emitBusinessChange(nextBusiness)
    }
    queuedDeltaRef.current += 1
    setTapBurst((value) => value + 1)
    const nextFloatId = floatIdRef.current + 1
    floatIdRef.current = nextFloatId
    setTapFloats((current) => [
      ...current,
      {
        id: nextFloatId,
        drift: Math.round((Math.random() - 0.5) * 28),
        value: workerReward,
      },
    ])
    const floatTimerId = window.setTimeout(() => {
      setTapFloats((current) => current.filter((entry) => entry.id !== nextFloatId))
      floatTimersRef.current = floatTimersRef.current.filter((timerId) => timerId !== floatTimerId)
    }, 920)
    floatTimersRef.current.push(floatTimerId)

    if (resetBurstTimerRef.current !== null) {
      window.clearTimeout(resetBurstTimerRef.current)
    }
    resetBurstTimerRef.current = window.setTimeout(() => {
      setTapBurst(0)
    }, 180)

    void flushQueuedStars()
  }, [businessMode, emitBusinessChange, emitStarsChange, flushQueuedStars, userId])

  return (
    <div className="clickerOverlay" role="presentation" onClick={onClose}>
      <div
        className="clickerModal"
        role="dialog"
        aria-modal="true"
        aria-label="Работа"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="clickerHeader">
          <div>
            <h3>Работа</h3>
            <p className="clickerSubtext">{clickDescription}</p>
          </div>
          <button type="button" className="slotsClose" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="clickerBalance">
          <StarsIcon className="clickerBalanceIcon" />
          <span>{formatStars(stars)}</span>
        </div>

        <div className="clickerStage">
          {tapFloats.map((float) => (
            <span
              key={float.id}
              className="clickerTapFloat"
              style={{ ['--clicker-float-drift' as any]: `${float.drift}px` }}
            >
              +{float.value}
            </span>
          ))}
          <button
            type="button"
            className={`clickerCoinButton ${tapBurst > 0 ? 'isBursting' : ''}`}
            onClick={handleTap}
            aria-label="Получить звезду"
          >
            <span className="clickerDeskScene" aria-hidden="true">
              <span className="clickerLaptop">
                <span className="clickerLaptopScreen">
                  <span className="clickerLaptopCamera" />
                  <span className="clickerLaptopCode">
                    <span className="clickerLaptopLine isWide" />
                    <span className="clickerLaptopLine" />
                    <span className="clickerLaptopLine isShort" />
                  </span>
                </span>
                <span className="clickerLaptopBase">
                  <span className="clickerLaptopKeyboard">
                    <span className="clickerKeyboardRow">
                      <span className="clickerKey" />
                      <span className="clickerKey" />
                      <span className="clickerKey" />
                      <span className="clickerKey" />
                    </span>
                    <span className="clickerKeyboardRow">
                      <span className="clickerKey" />
                      <span className="clickerKey" />
                      <span className="clickerKey" />
                      <span className="clickerKey" />
                      <span className="clickerKey" />
                    </span>
                    <span className="clickerKeyboardRow isWide">
                      <span className="clickerKey" />
                      <span className="clickerKey" />
                      <span className="clickerKey" />
                    </span>
                    <span className="clickerTrackpad" />
                  </span>
                </span>
              </span>
              <span className="clickerHands">
                <span className="clickerHand clickerHandLeft" />
                <span className="clickerHand clickerHandRight" />
              </span>
            </span>
            <span className="clickerCoinSpark" aria-hidden="true" />
          </button>
        </div>

        {status && <div className="clickerStatus">{status}</div>}
      </div>
    </div>
  )
}

function BusinessPanel({
  userId,
  stars,
  onStarsChange,
  onClose,
  onBusinessChange,
  onBusinessModeChange,
  variant = 'panel',
}: {
  userId: string
  stars: string
  onStarsChange: (nextStars: string) => void
  onClose?: () => void
  onBusinessChange?: (business: BusinessProfile | null) => void
  onBusinessModeChange?: (mode: BusinessMode) => void
  variant?: 'panel' | 'page'
}) {
  const [mode, setMode] = useState<BusinessMode>('none')
  const [business, setBusiness] = useState<BusinessProfile | null>(null)
  const [owner, setOwner] = useState<BusinessOwnerPreview | null>(null)
  const [assignment, setAssignment] = useState<BusinessAssignment | null>(null)
  const [staff, setStaff] = useState<BusinessStaffSlot[]>(() => loadLocalBusinessStaff(userId))
  const [pickerForSlot, setPickerForSlot] = useState<number | null>(null)
  const [roleDraft, setRoleDraft] = useState('')
  const [friends, setFriends] = useState<UserPreview[]>([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [loadingBusiness, setLoadingBusiness] = useState(false)
  const [savingBusiness, setSavingBusiness] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const emitBusinessChange = useEffectEvent((nextBusiness: BusinessProfile | null) => {
    onBusinessChange?.(nextBusiness)
  })
  const emitBusinessModeChange = useEffectEvent((nextMode: BusinessMode) => {
    onBusinessModeChange?.(nextMode)
  })
  const emitStarsChange = useEffectEvent((nextStars: string) => {
    onStarsChange(nextStars)
  })
  const emitClose = useEffectEvent(() => {
    onClose?.()
  })
  const applyBusinessPayload = useEffectEvent((payload: BusinessPayload) => {
    const nextBusiness = payload.business ?? null
    const nextMode = payload.mode ?? (nextBusiness ? 'owner' : 'none')
    const nextStaff = normalizeBusinessStaff(payload.staff)

    setMode(nextMode)
    setBusiness(nextBusiness)
    setOwner(payload.owner ?? null)
    setAssignment(payload.assignment ?? null)
    setStaff(nextStaff)
    setBusinessName(nextBusiness?.name ?? '')
    setBusinessDescription(nextBusiness?.description ?? '')
    emitBusinessChange(nextBusiness)
    emitBusinessModeChange(nextMode)

    if (nextMode === 'owner' && nextBusiness) {
      saveLocalBusiness(userId, nextBusiness)
      saveLocalBusinessStaff(userId, nextStaff)
    }

    if (typeof payload.stars === 'string') {
      emitStarsChange(payload.stars)
    }
  })

  const isOwner = mode === 'owner'
  const isEmployee = mode === 'employee'

  const loadBusiness = useCallback(async () => {
    setLoadingBusiness(true)
    const localBusiness = loadLocalBusiness(userId)
    try {
      const r = await fetchWithTimeout(`/api/business?userId=${encodeURIComponent(userId)}`)
      if (!r.ok) throw new Error('Не удалось загрузить бизнес')
      const data = (await r.json()) as BusinessPayload
      if (!data.business && localBusiness) {
        const restored = await restoreBusinessFromLocal(userId, localBusiness)
        applyBusinessPayload(restored ?? createLocalBusinessPayload(userId, localBusiness))
      } else {
        applyBusinessPayload({
          ...data,
          staff: normalizeBusinessStaff(data.staff),
        })
      }
    } catch {
      applyBusinessPayload(createLocalBusinessPayload(userId, localBusiness))
    } finally {
      setLoadingBusiness(false)
    }
  }, [userId])

  useEffect(() => {
    void loadBusiness()
  }, [loadBusiness])

  const loadFriends = useCallback(async () => {
    if (!business || !isOwner) {
      setFriends([])
      return
    }
    setLoadingFriends(true)
    try {
      const r = await fetch(`/api/friends?userId=${encodeURIComponent(userId)}`)
      if (!r.ok) throw new Error('Не удалось загрузить друзей')
      const data = (await r.json()) as FriendLists
      setFriends(data.friends ?? [])
      setNotice(null)
    } catch {
      setFriends([])
      setNotice('Добавьте друзей, чтобы нанимать сотрудников в бизнес.')
    } finally {
      setLoadingFriends(false)
    }
  }, [business, isOwner, userId])

  useEffect(() => {
    if (!business || !isOwner) return
    void loadFriends()
  }, [business, isOwner, loadFriends])

  const assignedIds = useMemo(
    () => new Set(staff.map((slot) => slot.userId).filter((value): value is string => Boolean(value))),
    [staff],
  )

  const availableFriends = useMemo(() => {
    if (pickerForSlot === null) return []
    const currentUserId = staff[pickerForSlot]?.userId
    return friends.filter((friend) => friend.userId === currentUserId || !assignedIds.has(friend.userId))
  }, [assignedIds, friends, pickerForSlot, staff])

  const openStaffPicker = useCallback((slotIndex: number) => {
    if (!isOwner) return
    setPickerForSlot(slotIndex)
    setRoleDraft(staff[slotIndex]?.roleName ?? getDefaultBusinessRole(slotIndex))
  }, [isOwner, staff])

  const syncStaffSlot = useCallback(async (
    slotIndex: number,
    nextEmployee: { userId: string | null; username: string | null; displayName: string | null },
  ) => {
    if (!business || !isOwner) return

    const normalizedRole = roleDraft.trim() || getDefaultBusinessRole(slotIndex)
    setSavingBusiness(true)
    setNotice(null)

    try {
      const r = await fetchWithTimeout('/api/business', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'staff',
          userId,
          slotIndex,
          employeeUserId: nextEmployee.userId,
          roleName: normalizedRole,
        }),
      })
      const data = (await r.json().catch(() => null)) as (BusinessPayload & { error?: string }) | null
      if (!r.ok) {
        if (data?.error) throw new Error(data.error)
        throw new Error('__BUSINESS_STAFF_LOCAL__')
      }

      const payload = data
        ? {
            ...data,
            staff: normalizeBusinessStaff(data.staff),
          }
        : createLocalBusinessPayload(userId, business)
      applyBusinessPayload(payload)
      setPickerForSlot(null)
    } catch (error) {
      if (
        error instanceof Error &&
        error.message !== '__BUSINESS_STAFF_LOCAL__' &&
        !/Failed to fetch|NetworkError|fetch|abort/i.test(error.message)
      ) {
        setNotice(error.message)
        setSavingBusiness(false)
        return
      }

      const nextStaff = staff.map((slot) => (
        slot.slotIndex === slotIndex
          ? {
              ...slot,
              roleName: normalizedRole,
              userId: nextEmployee.userId,
              username: nextEmployee.username,
              displayName: nextEmployee.displayName,
            }
          : slot
      ))

      setStaff(nextStaff)
      saveLocalBusinessStaff(userId, nextStaff)
      setPickerForSlot(null)
    } finally {
      setSavingBusiness(false)
    }
  }, [applyBusinessPayload, business, isOwner, roleDraft, staff, userId])

  const handleAssign = useCallback((slotIndex: number, friend: UserPreview) => {
    void syncStaffSlot(slotIndex, {
      userId: friend.userId,
      username: friend.username,
      displayName: friend.displayName,
    })
  }, [syncStaffSlot])

  const handleClear = useCallback((slotIndex: number) => {
    void syncStaffSlot(slotIndex, {
      userId: null,
      username: null,
      displayName: null,
    })
  }, [syncStaffSlot])

  const handleSaveRole = useCallback((slotIndex: number) => {
    const slot = staff[slotIndex]
    if (!slot) return
    void syncStaffSlot(slotIndex, {
      userId: slot.userId,
      username: slot.username,
      displayName: slot.displayName,
    })
  }, [staff, syncStaffSlot])

  const handleOpenBusiness = useCallback(async () => {
    const normalizedName = businessName.trim() || 'Мой бизнес'
    const normalizedDescription = businessDescription.trim() || 'Описание бизнеса появится позже.'
    setSavingBusiness(true)
    setNotice(null)
    try {
      const r = await fetch('/api/business', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: normalizedName,
          description: normalizedDescription,
        }),
      })
      const data = await r.json().catch(() => null) as (BusinessPayload & { error?: string }) | null
      if (!r.ok) {
        if (r.status === 400 && data?.error) {
          throw new Error(data.error)
        }
        throw new Error('__BUSINESS_LOCAL_FALLBACK__')
      }

      const payload = data
        ? {
            ...data,
            staff: normalizeBusinessStaff(data.staff),
          }
        : {
            ...createLocalBusinessPayload(userId, {
              name: normalizedName,
              description: normalizedDescription,
              capital: String(BUSINESS_START_CAPITAL),
            }),
            stars,
          }
      applyBusinessPayload(payload)
      emitClose()
    } catch (error) {
      if (
        error instanceof Error &&
        error.message !== '__BUSINESS_LOCAL_FALLBACK__' &&
        !/Failed to fetch|NetworkError|fetch/i.test(error.message)
      ) {
        setNotice(error.message)
        setSavingBusiness(false)
        return
      }

      const currentStars = Number(stars)
      if (!Number.isFinite(currentStars) || currentStars < BUSINESS_OPEN_COST) {
        setNotice('Недостаточно звёзд для открытия бизнеса')
        setSavingBusiness(false)
        return
      }

      const nextStars = String(Math.max(0, currentStars - BUSINESS_OPEN_COST))
      const nextBusiness = {
        name: normalizedName,
        description: normalizedDescription,
        capital: String(BUSINESS_START_CAPITAL),
      }

      setMode('owner')
      setBusiness(nextBusiness)
      setOwner({
        userId,
        username: null,
        displayName: null,
      })
      setAssignment(null)
      setStaff(createEmptyBusinessStaff())
      emitBusinessChange(nextBusiness)
      setBusinessName(nextBusiness.name)
      setBusinessDescription(nextBusiness.description)
      saveLocalBusiness(userId, nextBusiness)
      saveLocalBusinessStaff(userId, createEmptyBusinessStaff())
      saveLocalStars(userId, nextStars)
      emitStarsChange(nextStars)
      emitClose()
    } finally {
      setSavingBusiness(false)
    }
  }, [applyBusinessPayload, businessDescription, businessName, emitClose, emitBusinessChange, emitStarsChange, stars, userId])

  const handleSaveBusiness = useCallback(async () => {
    if (!business || !isOwner) return
    const normalizedName = businessName.trim() || business.name
    const normalizedDescription = businessDescription.trim() || business.description
    setSavingBusiness(true)
    setNotice(null)
    try {
      const r = await fetch('/api/business', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'profile',
          userId,
          name: normalizedName,
          description: normalizedDescription,
        }),
      })
      const data = await r.json().catch(() => null) as (BusinessPayload & { error?: string }) | null
      if (!r.ok) throw new Error(data?.error ?? '__BUSINESS_LOCAL_SAVE__')

      const payload = data
        ? {
            ...data,
            staff: normalizeBusinessStaff(data.staff),
          }
        : createLocalBusinessPayload(userId, {
            ...business,
            name: normalizedName,
            description: normalizedDescription,
          })
      applyBusinessPayload(payload)
    } catch {
      const nextBusiness = {
        ...business,
        name: normalizedName,
        description: normalizedDescription,
      }
      setBusiness(nextBusiness)
      emitBusinessChange(nextBusiness)
      saveLocalBusiness(userId, nextBusiness)
    } finally {
      setSavingBusiness(false)
    }
  }, [applyBusinessPayload, business, businessDescription, businessName, emitBusinessChange, isOwner, userId])

  return (
    <section className={variant === 'page' ? 'businessPanel businessPage' : 'panel businessPanel'}>
      <div className="businessPanelHeader">
        <h2>Бизнес</h2>
        {onClose && (
          <button type="button" className="gardenPanelClose" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        )}
      </div>

      {loadingBusiness ? (
        <div className="businessNotice">Загружаем бизнес...</div>
      ) : business ? (
        isEmployee ? (
          <>
            <div className="businessGuestCard">
              <div className="businessGuestEyebrow">Гостевая страница бизнеса</div>
              <div className="businessGuestTitle">{business.name}</div>
              <p className="businessHint">{business.description}</p>
              <div className="businessGuestMeta">
                <span>Владелец</span>
                <strong>{owner ? getUserPrimaryLabel(owner) : 'Неизвестно'}</strong>
              </div>
              {assignment && (
                <div className="businessGuestMeta">
                  <span>Ваша должность</span>
                  <strong>{assignment.roleName}</strong>
                </div>
              )}
              <div className="businessCapitalRow">
                <span className="businessCapitalLabel">Капитал бизнеса</span>
                <span className="businessCapitalValue">{formatStars(business.capital)}</span>
              </div>
            </div>

            <div className="businessRoster">
              {staff.map((slot) => (
                <div key={slot.slotIndex} className={`businessRosterItem ${slot.userId ? 'isFilled' : ''}`}>
                  <div className="businessRosterRole">{slot.roleName}</div>
                  <div className="businessRosterName">
                    {slot.userId ? getUserPrimaryLabel(slot) : 'Вакансия'}
                  </div>
                  <div className="businessRosterSecondary">
                    {slot.userId ? getUserSecondaryLabel(slot) : 'Сотрудник ещё не назначен'}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="businessInfoCard">
              <label className="businessField">
                <span>Название</span>
                <input
                  className="businessInput"
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Название бизнеса"
                />
              </label>
              <label className="businessField">
                <span>Описание</span>
                <textarea
                  className="businessTextarea"
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  placeholder="Описание бизнеса"
                  rows={3}
                />
              </label>
              <div className="businessCapitalRow">
                <span className="businessCapitalLabel">Капитал бизнеса</span>
                <span className="businessCapitalValue">{formatStars(business.capital)}</span>
              </div>
              <button
                type="button"
                className="businessPrimaryButton"
                onClick={() => void handleSaveBusiness()}
                disabled={savingBusiness}
              >
                {savingBusiness ? 'Сохраняем...' : 'Сохранить бизнес'}
              </button>
            </div>

            <p className="businessHint">Выбирайте друзей по слотам и задавайте для каждого название должности.</p>
            {notice && <div className="businessNotice">{notice}</div>}
            <div className="businessGrid">
              {staff.map((slot) => (
                <button
                  key={slot.slotIndex}
                  type="button"
                  className={`businessSlot ${slot.userId ? 'isFilled' : ''}`}
                  onClick={() => openStaffPicker(slot.slotIndex)}
                  aria-label={slot.userId ? `Сотрудник ${getUserPrimaryLabel(slot)}` : `Пустой слот сотрудника ${slot.slotIndex + 1}`}
                >
                  <div className="businessSlotIcon" aria-hidden="true">
                    {slot.userId ? <FriendsIcon /> : <GardenIcon />}
                  </div>
                  <div className="businessSlotCaption">Сотрудник {slot.slotIndex + 1}</div>
                  <div className="businessSlotRole">{slot.roleName}</div>
                  {slot.userId ? (
                    <div className="businessSlotMeta">
                      <div className="businessSlotPrimary">{getUserPrimaryLabel(slot)}</div>
                      <div className="businessSlotSecondary">{getUserSecondaryLabel(slot)}</div>
                    </div>
                  ) : (
                    <div className="businessSlotEmpty">Пригласить друга</div>
                  )}
                </button>
              ))}
            </div>
          </>
        )
      ) : (
        <div className="businessUnlockCard">
          <p className="businessHint">Откройте свой бизнес за {formatStars(String(BUSINESS_OPEN_COST))} звёзд. После открытия капитал бизнеса стартует с {formatStars(String(BUSINESS_START_CAPITAL))} звёзд.</p>
          <label className="businessField">
            <span>Название</span>
            <input
              className="businessInput"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Название бизнеса"
            />
          </label>
          <label className="businessField">
            <span>Описание</span>
            <textarea
              className="businessTextarea"
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              placeholder="Короткое описание бизнеса"
              rows={3}
            />
          </label>
          {notice && <div className="businessNotice">{notice}</div>}
          <button
            type="button"
            className="businessPrimaryButton"
            onClick={() => void handleOpenBusiness()}
            disabled={savingBusiness}
          >
            {savingBusiness ? 'Открываем...' : `Открыть за ${formatStars(String(BUSINESS_OPEN_COST))}`}
          </button>
        </div>
      )}

      {business && isOwner && pickerForSlot !== null && (
        <div className="businessPickerOverlay" onClick={() => setPickerForSlot(null)}>
          <div className="businessPicker" onClick={(e) => e.stopPropagation()}>
            <div className="businessPickerHeader">
              <h3>Сотрудник и должность</h3>
              {staff[pickerForSlot]?.userId && (
                <button
                  type="button"
                  className="businessPickerRemove"
                  onClick={() => handleClear(pickerForSlot)}
                >
                  Убрать
                </button>
              )}
            </div>

            <label className="businessField">
              <span>Название должности</span>
              <input
                className="businessInput"
                type="text"
                value={roleDraft}
                onChange={(e) => setRoleDraft(e.target.value)}
                placeholder="Например: маркетолог"
              />
            </label>

            <button
              type="button"
              className="businessPickerSave"
              onClick={() => handleSaveRole(pickerForSlot)}
              disabled={savingBusiness}
            >
              {savingBusiness ? 'Сохраняем...' : 'Сохранить должность'}
            </button>

            {loadingFriends ? (
              <p className="businessPickerEmpty">Загружаем друзей...</p>
            ) : availableFriends.length === 0 ? (
              <p className="businessPickerEmpty">Нет доступных друзей для найма.</p>
            ) : (
              <div className="businessPickerList">
                {availableFriends.map((friend) => (
                  <button
                    key={friend.userId}
                    type="button"
                    className="businessPickerItem"
                    onClick={() => handleAssign(pickerForSlot, friend)}
                    disabled={savingBusiness}
                  >
                    <div className="businessPickerItemIcon" aria-hidden="true">
                      <FriendsIcon />
                    </div>
                    <div className="businessPickerItemMeta">
                      <span className="businessPickerItemPrimary">{getUserPrimaryLabel(friend)}</span>
                      <span className="businessPickerItemSecondary">{getUserSecondaryLabel(friend)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              className="businessPickerCancel"
              onClick={() => setPickerForSlot(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function App() {
  const [userId, setUserId] = useState(() => getUserId())
  const pendingMigrationUserIdRef = useRef<string | null>(null)
  const [telegramIdentity, setTelegramIdentity] = useState<TelegramIdentity>(() => getTelegramIdentity(getUserId()))
  const [tab, setTab] = useState<TabKey>('home')
  const [isPackOpen, setIsPackOpen] = useState(false)
  const [isSlotsOpen, setIsSlotsOpen] = useState(false)
  const [isClickerOpen, setIsClickerOpen] = useState(false)
  const [isApartmentThemeOpen, setIsApartmentThemeOpen] = useState(false)
  const [packClicks, setPackClicks] = useState(0)
  const [isExploding, setIsExploding] = useState(false)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [didRewardThisOpen, setDidRewardThisOpen] = useState(false)
  const [rewardCard, setRewardCard] = useState<PackRewardResult | null>(null)
  const [packNextOpenAt, setPackNextOpenAt] = useState<number | null>(() => loadLocalPackNextOpenAt(userId))
  const [packStatusLoading, setPackStatusLoading] = useState(false)
  const [packOpening, setPackOpening] = useState(false)
  const [packNotice, setPackNotice] = useState<string | null>(null)
  const [packNow, setPackNow] = useState(() => Date.now())
  const [stars, setStars] = useState('0')
  const [businessMode, setBusinessMode] = useState<BusinessMode>('none')
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(() => loadLocalBusiness(userId))
  const [selectedHomeBackgroundId, setSelectedHomeBackgroundId] = useState<HomeBackgroundId>(() => loadHomeBackground(userId))
  const [selectedAvatarModelId, setSelectedAvatarModelId] = useState<AvatarModelId>(() => loadAvatarModel(userId))
  const hasApartment = useMemo(
    () => inventory.some((item) => item.cardId === APARTMENT_CARD_ID),
    [inventory]
  )
  const activeHomeBackground = useMemo(
    () => (hasApartment ? getHomeBackgroundById(selectedHomeBackgroundId) : null),
    [hasApartment, selectedHomeBackgroundId]
  )

  useEffect(() => {
    if (!isAnonymousUserId(userId)) return

    const syncTelegramUser = () => {
      const nextUserId = getUserId()
      if (nextUserId === userId || isAnonymousUserId(nextUserId)) return false
      pendingMigrationUserIdRef.current = userId
      setUserId(nextUserId)
      return true
    }

    if (syncTelegramUser()) return

    let attempts = 0
    const intervalId = window.setInterval(() => {
      attempts += 1
      if (syncTelegramUser() || attempts >= 24) {
        window.clearInterval(intervalId)
      }
    }, 350)

    return () => window.clearInterval(intervalId)
  }, [userId])

  useEffect(() => {
    const syncTelegramIdentity = () => {
      const nextIdentity = getTelegramIdentity(userId)
      setTelegramIdentity((currentIdentity) => (
        areTelegramIdentitiesEqual(currentIdentity, nextIdentity) ? currentIdentity : nextIdentity
      ))
      return nextIdentity
    }

    const firstIdentity = syncTelegramIdentity()
    if (firstIdentity.username || firstIdentity.displayName) return

    let attempts = 0
    const intervalId = window.setInterval(() => {
      attempts += 1
      const nextIdentity = syncTelegramIdentity()
      if (nextIdentity.username || nextIdentity.displayName || attempts >= 24) {
        window.clearInterval(intervalId)
      }
    }, 350)

    return () => window.clearInterval(intervalId)
  }, [userId])

  useEffect(() => {
    setBusinessProfile(loadLocalBusiness(userId))
    setBusinessMode(loadLocalBusiness(userId) ? 'owner' : 'none')
    setSelectedHomeBackgroundId(loadHomeBackground(userId))
    setSelectedAvatarModelId(loadAvatarModel(userId))
    setPackNextOpenAt(loadLocalPackNextOpenAt(userId))
  }, [userId])

  useEffect(() => {
    if (!isPackOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPackOpen(false)
        setTab('home')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isPackOpen])

  const loadProfile = useCallback(async () => {
    const fallbackStars = getFallbackStars(userId)
    setStars(fallbackStars)
    try {
      const previousUserId = pendingMigrationUserIdRef.current
      const r = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          previousUserId,
          username: telegramIdentity.username,
          displayName: telegramIdentity.displayName,
          avatarModel: selectedAvatarModelId,
        }),
      })
      if (!r.ok) return
      const data = (await r.json()) as { userId: string; stars: string; avatarModel?: string | null }
      const nextStars = typeof data.stars === 'string' ? data.stars : fallbackStars
      const nextAvatarModel = resolveAvatarModelId(data.avatarModel)
      setStars(nextStars)
      saveLocalStars(userId, nextStars)
      setSelectedAvatarModelId(nextAvatarModel)
      saveAvatarModel(userId, nextAvatarModel)
      pendingMigrationUserIdRef.current = null
    } catch {
      setStars(fallbackStars)
    }
  }, [selectedAvatarModelId, telegramIdentity.displayName, telegramIdentity.username, userId])

  const handleSelectAvatarModel = useCallback((modelId: AvatarModelId) => {
    setSelectedAvatarModelId(modelId)
    saveAvatarModel(userId, modelId)

    void (async () => {
      try {
        const r = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            userId,
            username: telegramIdentity.username,
            displayName: telegramIdentity.displayName,
            avatarModel: modelId,
          }),
        })
        if (!r.ok) return
        const data = (await r.json()) as { stars?: string; avatarModel?: string | null }
        const nextAvatarModel = resolveAvatarModelId(data.avatarModel)
        setSelectedAvatarModelId(nextAvatarModel)
        saveAvatarModel(userId, nextAvatarModel)
        if (typeof data.stars === 'string') {
          setStars(data.stars)
          saveLocalStars(userId, data.stars)
        }
      } catch {
        // local preview already updated
      }
    })()
  }, [telegramIdentity.displayName, telegramIdentity.username, userId])

  const loadInventory = useCallback(async () => {
    ensureLocalInventoryMigration(userId)
    try {
      const r = await fetch(`/api/inventory?userId=${encodeURIComponent(userId)}`)
      if (r.ok) {
        const data = (await r.json()) as {
          items: { card_id: string; name: string; image_src: string; qty: number }[]
        }
        const flattened: InventoryItem[] = []
        for (const it of data.items ?? []) {
          for (let i = 0; i < (it.qty ?? 1); i++) {
            flattened.push({
              id: `${it.card_id}_${i}_${Math.random().toString(16).slice(2)}`,
              cardId: it.card_id,
              name: it.name,
              imageSrc: it.image_src,
            })
          }
        }
        setInventory(flattened)
        return
      }
    } catch {
      // API недоступен (localhost без backend) — используем localStorage
    }

    // fallback (no DB / API failing)
    const local = loadLocalInventory(userId)
    const flattened: InventoryItem[] = []
    for (const card of ALL_CARDS) {
      const qty = local[card.id] ?? 0
      for (let i = 0; i < qty; i++) {
        flattened.push({
          id: `${card.id}_${i}_${Math.random().toString(16).slice(2)}`,
          cardId: card.id,
          name: card.name,
          imageSrc: card.imageSrc,
        })
      }
    }
    setInventory(flattened)
  }, [userId])

  useEffect(() => {
    void loadInventory()
  }, [loadInventory])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const loadBusinessStatus = useCallback(async () => {
    const localBusiness = loadLocalBusiness(userId)
    try {
      const r = await fetchWithTimeout(`/api/business?userId=${encodeURIComponent(userId)}`)
      if (!r.ok) throw new Error('Не удалось загрузить бизнес')
      const data = (await r.json()) as BusinessPayload
      let nextPayload: BusinessPayload = {
        ...data,
        staff: normalizeBusinessStaff(data.staff),
      }

      if (!nextPayload.business && localBusiness) {
        nextPayload = await restoreBusinessFromLocal(userId, localBusiness)
          ?? createLocalBusinessPayload(userId, localBusiness)
      }

      setBusinessMode(nextPayload.mode ?? (nextPayload.business ? 'owner' : 'none'))
      setBusinessProfile(nextPayload.business ?? null)
      if (nextPayload.mode === 'owner' && nextPayload.business) {
        saveLocalBusiness(userId, nextPayload.business)
        saveLocalBusinessStaff(userId, nextPayload.staff)
      }
      if (typeof nextPayload.stars === 'string') {
        setStars(nextPayload.stars)
        saveLocalStars(userId, nextPayload.stars)
      }
    } catch {
      setBusinessMode(localBusiness ? 'owner' : 'none')
      setBusinessProfile(localBusiness)
    }
  }, [userId])

  useEffect(() => {
    void loadBusinessStatus()
  }, [loadBusinessStatus])

  useEffect(() => {
    setSelectedHomeBackgroundId(loadHomeBackground(userId))
  }, [userId])

  const packRemainingMs = packNextOpenAt ? Math.max(0, packNextOpenAt - packNow) : 0
  const isPackReady = packRemainingMs === 0

  const syncPackStatus = useCallback(async () => {
    setPackStatusLoading(true)
    try {
      const r = await fetchWithTimeout(`/api/pack?userId=${encodeURIComponent(userId)}`)
      const data = await r.json().catch(() => null) as { stars?: string; nextOpenAt?: number | null } | null
      if (!r.ok) throw new Error('pack-status')

      const nextOpenAt = typeof data?.nextOpenAt === 'number' ? data.nextOpenAt : null
      setPackNextOpenAt(nextOpenAt)
      saveLocalPackNextOpenAt(userId, nextOpenAt)
      if (typeof data?.stars === 'string') {
        setStars(data.stars)
        saveLocalStars(userId, data.stars)
      }
    } catch {
      const nextOpenAt = loadLocalPackNextOpenAt(userId)
      setPackNextOpenAt(nextOpenAt)
    } finally {
      setPackStatusLoading(false)
    }
  }, [userId])

  const openPack = useCallback(async () => {
    if (packOpening || !isPackReady) return

    setPackOpening(true)
    setPackNotice(null)

    try {
      const r = await fetchWithTimeout('/api/pack', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await r.json().catch(() => null) as {
        error?: string
        stars?: string
        nextOpenAt?: number | null
        reward?: PackRewardResult
      } | null

      if (!r.ok) {
        if (typeof data?.nextOpenAt === 'number') {
          setPackNextOpenAt(data.nextOpenAt)
          saveLocalPackNextOpenAt(userId, data.nextOpenAt)
          setPackNow(Date.now())
          setPackNotice('Стикерпак ещё на перезарядке')
          if (typeof data?.stars === 'string') {
            setStars(data.stars)
            saveLocalStars(userId, data.stars)
          }
          return
        }
        throw new Error(data?.error ?? 'pack-open')
      }

      const nextOpenAt = typeof data?.nextOpenAt === 'number' ? data.nextOpenAt : Date.now() + PACK_COOLDOWN_MS
      const reward = data?.reward ?? {
        kind: 'empty',
        title: 'Пусто',
        subtitle: 'В этот раз без награды',
      } satisfies PackRewardResult

      setRewardCard(reward)
      setPackNextOpenAt(nextOpenAt)
      setPackNow(Date.now())
      saveLocalPackNextOpenAt(userId, nextOpenAt)

      if (typeof data?.stars === 'string') {
        setStars(data.stars)
        saveLocalStars(userId, data.stars)
      }

      if (reward.kind === 'item') {
        await loadInventory()
      }
    } catch {
      const localNextOpenAt = loadLocalPackNextOpenAt(userId)
      if (localNextOpenAt && localNextOpenAt > Date.now()) {
        setPackNextOpenAt(localNextOpenAt)
        setPackNow(Date.now())
        setPackNotice('Стикерпак ещё на перезарядке')
        return
      }

      const reward = pickLocalPackReward()
      const nextOpenAt = Date.now() + PACK_COOLDOWN_MS
      setRewardCard(reward)
      setPackNextOpenAt(nextOpenAt)
      setPackNow(Date.now())
      saveLocalPackNextOpenAt(userId, nextOpenAt)

      if (reward.kind === 'stars') {
        const nextStars = String(Math.max(0, Number(stars) + reward.starsAwarded))
        setStars(nextStars)
        saveLocalStars(userId, nextStars)
      } else if (reward.kind === 'item') {
        upsertLocalCard(userId, reward.cardId, 1)
        await loadInventory()
      }
    } finally {
      setPackOpening(false)
    }
  }, [isPackReady, loadInventory, packOpening, stars, userId])

  useEffect(() => {
    if (!isPackOpen) return
    setPackNow(Date.now())
    void syncPackStatus()
  }, [isPackOpen, syncPackStatus])

  useEffect(() => {
    if (!isPackOpen || !packNextOpenAt || packNextOpenAt <= Date.now()) return
    const intervalId = window.setInterval(() => {
      setPackNow(Date.now())
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [isPackOpen, packNextOpenAt])

  useEffect(() => {
    if (!isPackOpen) {
      setPackClicks(0)
      setIsExploding(false)
      setDidRewardThisOpen(false)
      setRewardCard(null)
      setPackNotice(null)
      return
    }
    if (packClicks === 2) {
      setIsExploding(true)
      const t = window.setTimeout(() => setIsExploding(false), 420)
      return () => window.clearTimeout(t)
    }
  }, [isPackOpen, packClicks])

  useEffect(() => {
    if (!isPackOpen) return
    if (packClicks < 2) return
    if (didRewardThisOpen) return
    setDidRewardThisOpen(true)
    void openPack()
  }, [didRewardThisOpen, isPackOpen, openPack, packClicks])

  const [isGardenOpen, setIsGardenOpen] = useState(false)

  const title = useMemo(() => {
    switch (tab) {
      case 'home':
        return 'Дом'
      case 'inventory':
        return 'Инвентарь'
      case 'friends':
        return 'Друзья'
      case 'customize':
        return 'Кастомизация'
      case 'business':
        return 'Бизнес'
    }
  }, [tab])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbarContent">
          <div className="topbarSide" aria-hidden="true" />
          <div className="topbarTitle">{title}</div>
          <div className="starsBadge" aria-label={`Баланс звёзд: ${formatStars(stars)}`}>
            <StarsIcon className="starsBadgeIcon" />
            <span className="starsBadgeValue">{formatStars(stars)}</span>
          </div>
        </div>
      </header>

      <main className="screen" role="main">
        {tab === 'home' && (
          <section className="home">
            <div className={`homeStage ${activeHomeBackground ? 'hasBackground' : ''}`}>
              {activeHomeBackground && (
                <>
                  <div
                    className="homeBackdrop"
                    style={{ backgroundImage: `url(${activeHomeBackground.imageSrc})` }}
                    aria-hidden="true"
                  />
                  {activeHomeBackground.id === 'apartment_midnight' && (
                    <div className="homeNightStars" aria-hidden="true">
                      {NIGHT_LOFT_STARS.map((star, index) => (
                        <span
                          key={`${star.left}-${star.top}-${index}`}
                          className="homeNightStar"
                          style={{
                            left: star.left,
                            top: star.top,
                            width: `${star.size}px`,
                            height: `${star.size}px`,
                            animationDelay: star.delay,
                            animationDuration: star.duration,
                            opacity: star.opacity,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <div className="homeBackdropShade" aria-hidden="true" />
                </>
              )}
              <div className="homeAvatarWrap">
                <Stickman modelId={selectedAvatarModelId} />
              </div>
            </div>
            <button
              type="button"
              className="edgeFriendsButton"
              aria-label="Друзья"
              onClick={() => setTab('friends')}
            >
              <FriendsIcon />
            </button>
            {businessMode === 'employee' && businessProfile && (
              <button
                type="button"
                className="edgeBusinessInfoButton"
                aria-label="Информация о бизнесе"
                onClick={() => setTab('business')}
              >
                <BusinessInfoIcon />
              </button>
            )}
            {!businessProfile && (
              <button
                type="button"
                className="edgeGardenButton"
                aria-label="Бизнес"
                onClick={() => setIsGardenOpen(true)}
              >
                <GardenIcon />
              </button>
            )}
            <button
              type="button"
              className="edgePackButton"
              aria-label="Стикерпак"
              onClick={() => setIsPackOpen(true)}
            >
              <PackIcon />
            </button>
            <button
              type="button"
              className="edgeRouletteButton"
              aria-label="Рулетка"
              onClick={() => setIsSlotsOpen(true)}
            >
              <RouletteIcon />
            </button>
            <button
              type="button"
              className="edgeCoinButton"
              aria-label="Работа"
              onClick={() => setIsClickerOpen(true)}
            >
              <CoinIcon />
            </button>
          </section>
        )}

        {tab === 'inventory' && (
          <InventoryPanel
            inventory={inventory}
            userId={userId}
            onReload={loadInventory}
            onItemTap={(item) => {
              if (item.cardId === APARTMENT_CARD_ID) {
                setIsApartmentThemeOpen(true)
              }
            }}
          />
        )}

        {tab === 'friends' && (
          <FriendsPanel
            userId={userId}
            inventory={inventory}
            onReloadInventory={loadInventory}
          />
        )}

        {tab === 'customize' && (
          <CustomizePanel
            userId={userId}
            selectedAvatarModelId={selectedAvatarModelId}
            onSelectAvatarModel={handleSelectAvatarModel}
          />
        )}

        {tab === 'business' && businessProfile && (
          <BusinessPanel
            userId={userId}
            stars={stars}
            variant="page"
            onStarsChange={(nextStars) => {
              setStars(nextStars)
              saveLocalStars(userId, nextStars)
            }}
            onBusinessModeChange={setBusinessMode}
            onBusinessChange={(nextBusiness) => {
              setBusinessProfile(nextBusiness)
            }}
          />
        )}
      </main>

      {isPackOpen && (
        <div
          className="packModalOverlay"
          role="presentation"
          onClick={() => {
            setIsPackOpen(false)
            setTab('home')
          }}
        >
          <div className="packStage" role="dialog" aria-modal="true" aria-label="Стикерпак" onClick={(e) => e.stopPropagation()}>
            <div className="packHeader">
              <h3>Стикерпак</h3>
              <p className="packHint">
                {rewardCard
                  ? 'Следующее открытие будет доступно после перезарядки.'
                  : isPackReady
                    ? 'Можно вскрыть сейчас. Новый пак открывается раз в 12 часов.'
                    : `Следующее вскрытие через ${formatCountdown(packRemainingMs)}.`}
              </p>
              <p className="packHint isMuted">Награды: +10 звёзд, +100 звёзд или квартира.</p>
            </div>

            {packClicks < 2 || isExploding ? (
              <button
                type="button"
                className={
                  isExploding
                    ? 'packInteractive packExplode'
                    : packClicks > 0
                      ? 'packInteractive packShake2'
                      : `packInteractive ${(!isPackReady || packStatusLoading || packOpening) ? 'isLocked' : ''}`
                }
                aria-label="Открыть пакетик"
                disabled={!isPackReady || packStatusLoading || packOpening}
                onClick={(e) => {
                  e.stopPropagation()
                  if (isExploding || !isPackReady || packStatusLoading || packOpening) return
                  setPackClicks((c) => Math.min(2, c + 1))
                }}
              >
                {isExploding && (
                  <div className="confetti" aria-hidden="true">
                    {Array.from({ length: 22 }).map((_, i) => (
                      <span key={i} className="confettiPiece" style={{ ['--i' as any]: i }} />
                    ))}
                  </div>
                )}
                <PackIcon className="packGlowIcon" />
              </button>
            ) : rewardCard ? (
              <div className="rewardCard" aria-label="Карточка" onClick={(e) => e.stopPropagation()}>
                <div className="rewardIconFrame" aria-hidden="true">
                  {rewardCard.kind === 'item' ? (
                    <ChromaKeyImage className="rewardIcon" src={rewardCard.imageSrc} alt={rewardCard.title} />
                  ) : rewardCard.kind === 'stars' ? (
                    <StarsIcon className="rewardVectorIcon" />
                  ) : (
                    <PackIcon className="rewardVectorIcon" />
                  )}
                </div>
                <div className="rewardName">{rewardCard.title}</div>
                <div className="rewardSubtext">{rewardCard.subtitle}</div>
              </div>
            ) : (
              <div className="rewardCard isLoading" aria-live="polite">
                <div className="rewardName">{packOpening ? 'Открываем...' : 'Готовим пак...'}</div>
              </div>
            )}

            {packNotice && <div className="packNotice">{packNotice}</div>}
          </div>
        </div>
      )}

      {isSlotsOpen && (
        <SlotsModal
          userId={userId}
          stars={stars}
          onClose={() => setIsSlotsOpen(false)}
          onStarsChange={(nextStars) => {
            setStars(nextStars)
            saveLocalStars(userId, nextStars)
          }}
        />
      )}

      {isClickerOpen && (
        <ClickerModal
          userId={userId}
          stars={stars}
          businessMode={businessMode}
          businessProfile={businessProfile}
          onClose={() => setIsClickerOpen(false)}
          onStarsChange={(nextStars) => {
            setStars(nextStars)
            saveLocalStars(userId, nextStars)
          }}
          onBusinessChange={(nextBusiness) => {
            setBusinessProfile(nextBusiness)
          }}
        />
      )}

      {isApartmentThemeOpen && hasApartment && (
        <ApartmentThemeModal
          selectedBackgroundId={selectedHomeBackgroundId}
          onSelectBackground={(backgroundId) => {
            setSelectedHomeBackgroundId(backgroundId)
            saveHomeBackground(userId, backgroundId)
          }}
          onClose={() => setIsApartmentThemeOpen(false)}
        />
      )}

      {isGardenOpen && (
        <div
          className="gardenModalOverlay"
          onClick={() => setIsGardenOpen(false)}
        >
          <div className="gardenModalContent" onClick={(e) => e.stopPropagation()}>
            <BusinessPanel
              userId={userId}
              stars={stars}
              onStarsChange={(nextStars) => {
                setStars(nextStars)
                saveLocalStars(userId, nextStars)
              }}
              onBusinessModeChange={setBusinessMode}
              onBusinessChange={(nextBusiness) => {
                setBusinessProfile(nextBusiness)
                if (nextBusiness) {
                  setTab('business')
                }
              }}
              onClose={() => setIsGardenOpen(false)}
            />
          </div>
        </div>
      )}

      <nav className={`tabbar ${businessProfile ? 'hasBusiness' : ''}`} aria-label="Навигация">
        <button
          type="button"
          className={tab === 'home' ? 'tab active' : 'tab'}
          aria-current={tab === 'home' ? 'page' : undefined}
          onClick={() => setTab('home')}
        >
          <HomeIcon className="tabIcon" />
          <span>Дом</span>
        </button>
        <button
          type="button"
          className={tab === 'inventory' ? 'tab active' : 'tab'}
          aria-current={tab === 'inventory' ? 'page' : undefined}
          onClick={() => setTab('inventory')}
        >
          <InventoryIcon className="tabIcon" />
          <span>Инвентарь</span>
        </button>
        {businessProfile && (
          <button
            type="button"
            className={tab === 'business' ? 'tab active' : 'tab'}
            aria-current={tab === 'business' ? 'page' : undefined}
            onClick={() => setTab('business')}
          >
            <GardenIcon className="tabIcon" />
            <span>Бизнес</span>
          </button>
        )}
        <button
          type="button"
          className={tab === 'customize' ? 'tab active' : 'tab'}
          aria-current={tab === 'customize' ? 'page' : undefined}
          onClick={() => setTab('customize')}
        >
          <CustomizeIcon className="tabIcon" />
          <span>Кастомизация</span>
        </button>
      </nav>
    </div>
  )
}

export default App
