import { useEffect, useMemo, useState } from 'react'

type TabKey = 'home' | 'inventory' | 'customize'

type InventoryItem = {
  id: string
  name: string
  imageSrc: string
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

function ChromaKeyImage({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const [outSrc, setOutSrc] = useState<string | null>(null)

  useEffect(() => {
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

function App() {
  const [tab, setTab] = useState<TabKey>('home')
  const [isPackOpen, setIsPackOpen] = useState(false)
  const [packClicks, setPackClicks] = useState(0)
  const [isExploding, setIsExploding] = useState(false)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [didRewardThisOpen, setDidRewardThisOpen] = useState(false)
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

  const loadInventory = async () => {
    try {
      const r = await fetch(`/api/inventory?userId=${encodeURIComponent(userId)}`)
      if (!r.ok) return
      const data = (await r.json()) as { items: { card_id: string; name: string; image_src: string; qty: number }[] }
      const flattened: InventoryItem[] = []
      for (const it of data.items ?? []) {
        for (let i = 0; i < (it.qty ?? 1); i++) {
          flattened.push({
            id: `${it.card_id}_${i}_${Math.random().toString(16).slice(2)}`,
            name: it.name,
            imageSrc: it.image_src,
          })
        }
      }
      setInventory(flattened)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadInventory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    if (!isPackOpen) {
      setPackClicks(0)
      setIsExploding(false)
      setDidRewardThisOpen(false)
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
    fetch('/api/inventory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, cardId: 'rose_red', qty: 1 }),
    })
      .then(() => loadInventory())
      .catch(() => {})
  }, [didRewardThisOpen, isPackOpen, packClicks])

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
      </header>

      <main className="screen" role="main">
        {tab === 'home' && (
          <section className="home">
            <Stickman />
            <button
              type="button"
              className="edgePackButton"
              aria-label="Стикерпак"
              onClick={() => {
                setIsPackOpen(true)
              }}
            >
              <PackIcon />
            </button>
          </section>
        )}

        {tab === 'inventory' && (
          <section className="panel">
            <h2>Инвентарь</h2>
            {inventory.length === 0 ? (
              <p>Пока пусто.</p>
            ) : (
              <div className="inventoryGrid" role="list">
                {inventory.map((item) => (
                  <div key={item.id} className="inventoryCard" role="listitem">
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
            )}
          </section>
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
            ) : (
              <div className="rewardCard" aria-label="Карточка" onClick={(e) => e.stopPropagation()}>
                <div className="rewardIconFrame" aria-hidden="true">
                  <ChromaKeyImage className="rewardIcon" src="/card-rose.png" alt="Красная роза" />
                </div>
                <div className="rewardName">Красная Роза</div>
              </div>
            )}
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
