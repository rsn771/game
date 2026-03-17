import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        isExpanded?: boolean
        disableVerticalSwipes?: () => void
        requestFullscreen?: () => void
        initDataUnsafe?: {
          user?: { id?: number }
        }
      }
    }
  }
}

try {
  const wa = window.Telegram?.WebApp
  if (wa) {
    wa.ready()
    wa.expand()
    wa.disableVerticalSwipes?.()
    wa.requestFullscreen?.()
  }
} catch {
  // no-op outside Telegram
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
