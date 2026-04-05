import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type TabKey = 'home' | 'inventory' | 'customize'

type CardDef = { id: string; name: string; imageSrc: string }

type InventoryItem = {
  id: string
  cardId: string
  name: string
  imageSrc: string
}

const SEEDED_STAR_BALANCES: Record<string, string> = {
  '5651149188': '9999999999',
}

const PACK_CARDS: CardDef[] = [
  { id: 'rose_red', name: 'Красная Роза', imageSrc: '/card-rose.png' },
  { id: 'rose_white', name: 'Белая Роза', imageSrc: '/card-rose-white.png' },
  { id: 'knife_kitchen', name: 'Кухонный нож', imageSrc: '/card-knife-kitchen.png' },
  { id: 'log', name: 'Бревно', imageSrc: '/card-log.png' },
  { id: 'axe_noir', name: 'Топор нуар', imageSrc: '/card-axe-noir.png' },
  { id: 'axe', name: 'Топор', imageSrc: '/card-axe.png' },
]

const ALL_CARDS: CardDef[] = [
  ...PACK_CARDS,
  { id: 'rose_2red', name: '2 красные розы', imageSrc: '/card-rose-2red.png' },
  { id: 'rose_bouquet', name: 'Букет красных роз', imageSrc: '/card-rose-bouquet.png' },
]

const MERGE_RESULTS: Record<string, string> = {
  'rose_red|rose_red': 'rose_2red',
  'rose_red|rose_2red': 'rose_bouquet',
  'rose_2red|rose_red': 'rose_bouquet',
}

function pickRandomReward(): CardDef {
  return PACK_CARDS[Math.floor(Math.random() * PACK_CARDS.length)]
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

function getFallbackStars(userId: string): string {
  const local = loadLocalStars(userId)
  const seeded = SEEDED_STAR_BALANCES[userId]
  if (!seeded) return local
  return Number(local) > Number(seeded) ? local : seeded
}

function formatStars(stars: string): string {
  const numeric = Number(stars)
  if (!Number.isFinite(numeric)) return stars
  return new Intl.NumberFormat('ru-RU').format(numeric)
}

type GardenState = (string | null)[]

function loadGarden(userId: string): GardenState {
  try {
    const raw = localStorage.getItem(`garden_${userId}`)
    if (!raw) return [null, null, null, null, null, null]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [null, null, null, null, null, null]
    return Array.from({ length: 6 }, (_, i) =>
      typeof parsed[i] === 'string' ? parsed[i] : null
    )
  } catch {
    return [null, null, null, null, null, null]
  }
}

function saveGarden(userId: string, garden: GardenState) {
  try {
    localStorage.setItem(`garden_${userId}`, JSON.stringify(garden))
  } catch {
    // ignore
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

function GardenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role="presentation" aria-hidden="true">
      <g stroke="currentColor" fill="none" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
        {/* pot */}
        <path d="M20 36 L24 52 L40 52 L44 36 Z" />
        <path d="M22 36 L26 52 M42 36 L38 52" opacity="0.5" />
        {/* flower stems + blooms */}
        <path d="M28 36 V24 M36 36 V24" />
        <circle cx="28" cy="20" r="6" />
        <circle cx="36" cy="20" r="6" />
        <circle cx="32" cy="14" r="5" opacity="0.9" />
      </g>
    </svg>
  )
}

function PotIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 64" role="presentation" aria-hidden="true">
      <g stroke="currentColor" fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M12 24 L16 56 L32 56 L36 24 Z" />
        <path d="M14 24 L18 56 M34 24 L30 56" opacity="0.4" />
        <path d="M8 24 Q24 16 40 24" />
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

function Stickman() {
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

const LONG_PRESS_MS = 420
const LONG_PRESS_MOVE_PX = 12
const AUTO_SCROLL_EDGE_PX = 72
const AUTO_SCROLL_MAX_STEP = 18

function InventoryPanel({
  inventory,
  userId,
  onReload,
}: {
  inventory: InventoryItem[]
  userId: string
  onReload: () => void
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
        cleanupPointerSession()
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
    [applyMerge, cleanupPointerSession, clearLongPress, draggingItem, dropTargetId, inventory]
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

function getPlantableCards(inventory: InventoryItem[]): { cardId: string; name: string; imageSrc: string }[] {
  const seen = new Set<string>()
  const out: { cardId: string; name: string; imageSrc: string }[] = []
  for (const it of inventory) {
    if (seen.has(it.cardId)) continue
    seen.add(it.cardId)
    out.push({ cardId: it.cardId, name: it.name, imageSrc: it.imageSrc })
  }
  return out
}

function GardenPanel({
  inventory,
  userId,
  onReload,
  onClose,
}: {
  inventory: InventoryItem[]
  userId: string
  onReload: () => void
  onClose?: () => void
}) {
  const [garden, setGarden] = useState<GardenState>(() => loadGarden(userId))
  const [pickerForPot, setPickerForPot] = useState<number | null>(null)

  useEffect(() => {
    setGarden(loadGarden(userId))
  }, [userId])

  const plantable = useMemo(() => {
    const fromInv = getPlantableCards(inventory)
    if (pickerForPot === null) return fromInv
    const inPot = garden[pickerForPot]
    if (!inPot) return fromInv
    const card = getCardById(inPot)
    if (!card || fromInv.some((p) => p.cardId === card.id)) return fromInv
    return [...fromInv, { cardId: card.id, name: card.name, imageSrc: card.imageSrc }]
  }, [inventory, pickerForPot, garden])

  const handlePlant = useCallback(
    (potIndex: number, cardId: string) => {
      const next = [...garden]
      const old = next[potIndex]
      next[potIndex] = cardId
      setGarden(next)
      saveGarden(userId, next)
      if (old) upsertLocalCard(userId, old, 1)
      if (old !== cardId) removeLocalCard(userId, cardId, 1)
      setPickerForPot(null)
      onReload()
    },
    [garden, userId, onReload]
  )

  const handlePotClick = useCallback((index: number) => {
    setPickerForPot(index)
  }, [])

  return (
    <section className="panel gardenPanel">
      <div className="gardenPanelHeader">
        <h2>Сад</h2>
        {onClose && (
          <button type="button" className="gardenPanelClose" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        )}
      </div>
      <p className="gardenHint">Нажмите на горшок, чтобы посадить цветок из инвентаря</p>
      <div className="gardenGrid">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            className="gardenPot"
            onClick={() => handlePotClick(i)}
            aria-label={garden[i] ? `Горшок с ${getCardById(garden[i]!)?.name ?? 'цветком'}` : 'Пустой горшок'}
          >
            <div className="gardenPotShape">
              <PotIcon />
            </div>
            {garden[i] ? (
              <div className="gardenFlower gardenFlowerSway">
                <ChromaKeyImage
                  className="gardenFlowerImg"
                  src={getCardById(garden[i]!)!.imageSrc}
                  alt=""
                />
              </div>
            ) : (
              <div className="gardenPotEmpty">+</div>
            )}
          </button>
        ))}
      </div>

      {pickerForPot !== null && (
        <div
          className="flowerPickerOverlay"
          onClick={() => setPickerForPot(null)}
        >
          <div className="flowerPicker" onClick={(e) => e.stopPropagation()}>
            <h3>Выберите цветок</h3>
            {plantable.length === 0 ? (
              <p className="flowerPickerEmpty">Нет цветов в инвентаре</p>
            ) : (
              <div className="flowerPickerGrid">
                {plantable.map((c) => (
                  <button
                    key={c.cardId}
                    type="button"
                    className="flowerPickerItem"
                    onClick={() => handlePlant(pickerForPot, c.cardId)}
                  >
                    <div className="flowerPickerThumb">
                      <ChromaKeyImage className="flowerPickerImg" src={c.imageSrc} alt="" />
                    </div>
                    <span className="flowerPickerName">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className="flowerPickerCancel"
              onClick={() => setPickerForPot(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function getCardById(id: string): CardDef | undefined {
  return ALL_CARDS.find((c) => c.id === id)
}

function App() {
  const [tab, setTab] = useState<TabKey>('home')
  const [isPackOpen, setIsPackOpen] = useState(false)
  const [packClicks, setPackClicks] = useState(0)
  const [isExploding, setIsExploding] = useState(false)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [didRewardThisOpen, setDidRewardThisOpen] = useState(false)
  const [rewardCard, setRewardCard] = useState<CardDef | null>(null)
  const [stars, setStars] = useState('0')
  const userId = useMemo(() => getUserId(), [])

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

  useEffect(() => {
    // ensure DB schema + seed exists (safe to call multiple times)
    fetch('/api/setup', { method: 'POST' }).catch(() => {})
  }, [])

  const loadProfile = useCallback(async () => {
    const fallbackStars = getFallbackStars(userId)
    setStars(fallbackStars)
    try {
      const r = await fetch(`/api/profile?userId=${encodeURIComponent(userId)}`)
      if (!r.ok) return
      const data = (await r.json()) as { userId: string; stars: string }
      const nextStars = typeof data.stars === 'string' ? data.stars : fallbackStars
      setStars(nextStars)
      saveLocalStars(userId, nextStars)
    } catch {
      setStars(fallbackStars)
    }
  }, [userId])

  const loadInventory = async () => {
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
  }

  useEffect(() => {
    void loadInventory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  useEffect(() => {
    if (!isPackOpen) {
      setPackClicks(0)
      setIsExploding(false)
      setDidRewardThisOpen(false)
      setRewardCard(null)
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
    const card = pickRandomReward()
    setRewardCard(card)
    upsertLocalCard(userId, card.id, 1)
    fetch('/api/inventory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, cardId: card.id, qty: 1 }),
    })
      .then(() => loadInventory())
      .catch(() => {})
  }, [didRewardThisOpen, isPackOpen, packClicks])

  const [isGardenOpen, setIsGardenOpen] = useState(false)

  const title = useMemo(() => {
    switch (tab) {
      case 'home':
        return 'Дом'
      case 'inventory':
        return 'Инвентарь'
      case 'customize':
        return 'Кастомизация'
    }
  }, [tab])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbarTitle">{title}</div>
        <div className="starsBadge" aria-label={`Баланс звёзд: ${formatStars(stars)}`}>
          <StarsIcon className="starsBadgeIcon" />
          <span className="starsBadgeValue">{formatStars(stars)}</span>
        </div>
      </header>

      <main className="screen" role="main">
        {tab === 'home' && (
          <section className="home">
            <Stickman />
            <button
              type="button"
              className="edgeGardenButton"
              aria-label="Сад"
              onClick={() => setIsGardenOpen(true)}
            >
              <GardenIcon />
            </button>
            <button
              type="button"
              className="edgePackButton"
              aria-label="Стикерпак"
              onClick={() => setIsPackOpen(true)}
            >
              <PackIcon />
            </button>
          </section>
        )}

        {tab === 'inventory' && (
          <InventoryPanel
            inventory={inventory}
            userId={userId}
            onReload={loadInventory}
          />
        )}

        {tab === 'customize' && (
          <section className="panel">
            <h2>Кастомизация</h2>
            <p>Скоро добавим предметы и скины.</p>
          </section>
        )}
      </main>

      {isPackOpen && (
        <div
          className="packModalOverlay"
          role="presentation"
          onClick={() => {
            if (packClicks >= 2 && !isExploding) {
              setIsPackOpen(false)
              setTab('home')
            }
          }}
        >
          <div className="packStage" role="dialog" aria-modal="true" aria-label="Стикерпак">
            {packClicks < 2 || isExploding ? (
              <button
                type="button"
                className={
                  isExploding
                    ? 'packInteractive packExplode'
                    : packClicks > 0
                      ? 'packInteractive packShake2'
                      : 'packInteractive'
                }
                aria-label="Открыть пакетик"
                onClick={(e) => {
                  e.stopPropagation()
                  if (isExploding) return
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
                  <ChromaKeyImage className="rewardIcon" src={rewardCard.imageSrc} alt={rewardCard.name} />
                </div>
                <div className="rewardName">{rewardCard.name}</div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {isGardenOpen && (
        <div
          className="gardenModalOverlay"
          onClick={() => setIsGardenOpen(false)}
        >
          <div className="gardenModalContent" onClick={(e) => e.stopPropagation()}>
            <GardenPanel
              inventory={inventory}
              userId={userId}
              onReload={loadInventory}
              onClose={() => setIsGardenOpen(false)}
            />
          </div>
        </div>
      )}

      <nav className="tabbar" aria-label="Навигация">
        <button
          type="button"
          className={tab === 'home' ? 'tab active' : 'tab'}
          aria-current={tab === 'home' ? 'page' : undefined}
          onClick={() => setTab('home')}
        >
          Дом
        </button>
        <button
          type="button"
          className={tab === 'inventory' ? 'tab active' : 'tab'}
          aria-current={tab === 'inventory' ? 'page' : undefined}
          onClick={() => setTab('inventory')}
        >
          Инвентарь
        </button>
        <button
          type="button"
          className={tab === 'customize' ? 'tab active' : 'tab'}
          aria-current={tab === 'customize' ? 'page' : undefined}
          onClick={() => setTab('customize')}
        >
          Кастомизация
        </button>
      </nav>
    </div>
  )
}

export default App
