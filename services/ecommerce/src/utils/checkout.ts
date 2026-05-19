import type { SystemLoad } from '../hooks/useSystemLoad'

/** HT-306: artificial checkout delay under load / SLA stress */
export const getCheckoutDelayMs = (load: SystemLoad): number => {
  if (load.slaReliability < 95) return 8000
  if (load.slaReliability < 98) return 5000
  if (load.currentRPS > 2000) return 4000
  if (load.currentRPS > 1000) return 2000
  if (load.status === 'SIMULATING' && load.currentRPS > 500) return 1000
  return 0
}

export const getCheckoutStatusMessage = (load: SystemLoad, delayMs: number): string => {
  if (delayMs === 0) return 'Processing your order…'
  if (load.slaReliability < 98) {
    return `High system load — checkout delayed (~${Math.round(delayMs / 1000)}s)…`
  }
  return `Peak demand detected — queueing checkout (~${Math.round(delayMs / 1000)}s)…`
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'
const SIMULATOR_URL = import.meta.env.VITE_SIMULATOR_URL || 'http://localhost:8083'

const sessionId = () => {
  const key = 'nexusgear_session'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    sessionStorage.setItem(key, id)
  }
  return id
}

export interface CheckoutResult {
  ok: boolean
  message: string
}

export async function checkoutItem(
  productId: number,
  quantity: number,
  _delayMs = 0,
): Promise<CheckoutResult> {
  const body = JSON.stringify({
    product_id: productId,
    quantity,
    session_id: sessionId(),
  })

  // Prefer real API (Chirrag HT-304); also ping simulator for load telemetry
  const targets = [
    `${API_URL}/api/checkout`,
    `${SIMULATOR_URL}/api/checkout`,
  ]

  let lastError = 'Checkout unavailable'
  for (const url of targets) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (res.ok) {
        return { ok: true, message: 'Order confirmed' }
      }
      lastError = await res.text()
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Network error'
    }
  }

  return { ok: false, message: lastError }
}
