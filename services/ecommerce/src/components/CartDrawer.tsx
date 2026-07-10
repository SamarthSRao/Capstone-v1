import { useState } from 'react'
import { Loader2, ShieldAlert, X } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useSystemLoad } from '../hooks/useSystemLoad'
import { useCircuitBreaker } from '../hooks/useCircuitBreaker'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
const SESSION_ID = 'demo-session'

interface CartDrawerProps {
  open: boolean
  onClose: () => void
}

async function postCheckout(
  productId: number,
  quantity: number,
): Promise<void> {
  const response = await fetch(`${API_URL}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      quantity,
      session_id: SESSION_ID,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Checkout failed (${response.status})`)
  }
}

/** Local mock checkout used when the circuit breaker is OPEN (HT-704). */
function mockCheckout(): { order_id: string; status: string; mode: string } {
  return {
    order_id: `mock-${Date.now()}`,
    status: 'confirmed',
    mode: 'fallback',
  }
}

/**
 * HT-306 — Chaos checkout delay:
 * RPS > 2000 → wait 2500ms before POST
 * RPS > 1000 → wait 1000ms
 * otherwise → checkout immediately
 *
 * HT-704 — Circuit breaker wraps the live API; on OPEN, falls back to mock checkout.
 */
export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const { items, total, removeItem, clearCart } = useCart()
  const systemLoad = useSystemLoad()
  const breaker = useCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 12_000 })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fallbackMode, setFallbackMode] = useState(false)

  if (!open) return null

  const handleCheckout = async () => {
    if (items.length === 0 || loading) return

    setLoading(true)
    setMessage(null)
    setError(null)

    // Inject dynamic latency to represent network congestion under load
    let delay = 0
    if (systemLoad.currentRPS > 2000) {
      delay = 2500
    } else if (systemLoad.currentRPS > 1000) {
      delay = 1000
    }

    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay))
    }

    // If breaker is already OPEN, skip the network and use local mock flow
    if (breaker.state === 'OPEN') {
      mockCheckout()
      clearCart()
      setFallbackMode(true)
      setMessage(
        'Safe mode: order recorded locally while the checkout API recovers.',
      )
      setLoading(false)
      return
    }

    try {
      await breaker.execute(async () => {
        for (const item of items) {
          await postCheckout(item.product.id, item.quantity)
        }
      })

      clearCart()
      setFallbackMode(false)
      setMessage('Order confirmed. Gear is on the way.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Checkout failed'

      if (msg.startsWith('CIRCUIT_OPEN')) {
        mockCheckout()
        clearCart()
        setFallbackMode(true)
        setMessage(
          'Checkout API unreachable — switched to safe local confirmation.',
        )
        setError(null)
      } else {
        // After enough failures the breaker trips OPEN on the next attempt
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close cart overlay"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-[var(--color-edge)] bg-[var(--color-panel)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-edge)] px-5 py-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">
            Your Cart
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--color-mist)] hover:text-[var(--color-snow)]"
            aria-label="Close cart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {breaker.state === 'OPEN' && (
          <div className="flex items-start gap-2 border-b border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 px-5 py-3 text-xs text-[var(--color-warn)]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Circuit breaker open</p>
              <p className="mt-0.5 text-[var(--color-mist)]">
                Live checkout is paused after repeated failures. Orders will use
                safe local fallback until the API recovers.
              </p>
              <button
                type="button"
                onClick={breaker.reset}
                className="mt-2 font-bold underline"
              >
                Reset breaker
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <p className="text-sm text-[var(--color-mist)]">
              {message ?? 'Cart is empty. Add gear from the catalog.'}
            </p>
          ) : (
            <ul className="space-y-4">
              {items.map(({ product, quantity }) => (
                <li
                  key={product.id}
                  className="flex items-start justify-between gap-3 border-b border-[var(--color-edge)] pb-3"
                >
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-[var(--color-mist)]">
                      Qty {quantity} · ${product.base_price.toFixed(2)} each
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(product.id)}
                    className="text-xs text-[var(--color-mist)] hover:text-[var(--color-danger)]"
                    disabled={loading}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p className="mt-4 text-sm text-[var(--color-danger)]">{error}</p>
          )}
          {message && items.length === 0 && (
            <p
              className={`mt-2 text-sm ${
                fallbackMode
                  ? 'text-[var(--color-warn)]'
                  : 'text-[var(--color-accent)]'
              }`}
            >
              {message}
            </p>
          )}
        </div>

        <div className="border-t border-[var(--color-edge)] px-5 py-4">
          <div className="mb-3 flex justify-between text-sm">
            <span className="text-[var(--color-mist)]">Total</span>
            <span className="font-semibold">${total.toFixed(2)}</span>
          </div>
          {systemLoad.currentRPS > 1000 && (
            <p className="mb-3 text-xs text-[var(--color-warn)]">
              High load detected ({systemLoad.currentRPS} RPS) — checkout may
              feel slower.
            </p>
          )}
          <button
            type="button"
            onClick={handleCheckout}
            disabled={items.length === 0 || loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-3 text-sm font-bold text-[var(--color-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin-slow" />
                Processing…
              </>
            ) : breaker.state === 'OPEN' ? (
              'Checkout (Safe Mode)'
            ) : (
              'Checkout'
            )}
          </button>
        </div>
      </aside>
    </div>
  )
}
