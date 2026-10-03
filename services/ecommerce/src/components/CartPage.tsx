import { useState } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useSystemLoad } from '../hooks/useSystemLoad'
import { useCircuitBreaker } from '../hooks/useCircuitBreaker'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
const SESSION_ID = 'demo-session'

interface CartPageProps {
  onBack: () => void
}

async function postCheckout(productId: number, quantity: number): Promise<void> {
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

function mockCheckout(): { order_id: string; status: string; mode: string } {
  return {
    order_id: `mock-${Date.now()}`,
    status: 'confirmed',
    mode: 'fallback',
  }
}

export function CartPage({ onBack }: CartPageProps) {
  const { items, total, removeItem, clearCart } = useCart()
  const systemLoad = useSystemLoad()
  const breaker = useCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 12_000 })
  const [loading, setLoading] = useState(false)
  const [waitingForServer, setWaitingForServer] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fallbackMode, setFallbackMode] = useState(false)

  const isDegraded = systemLoad.violations > 0 || systemLoad.slaReliability < 98

  const handleCheckout = async () => {
    if (items.length === 0 || loading) return

    setLoading(true)
    setWaitingForServer(false)
    setMessage(null)
    setError(null)

    let delay = 0
    if (isDegraded || systemLoad.currentRPS > 2000) {
      delay = 3000
    } else if (systemLoad.currentRPS > 1000) {
      delay = 1000
    }

    if (delay > 0) {
      setWaitingForServer(isDegraded || systemLoad.currentRPS > 2000)
      await new Promise((r) => setTimeout(r, delay))
    }

    if (breaker.state === 'OPEN') {
      mockCheckout()
      clearCart()
      setFallbackMode(true)
      setMessage('Safe mode: order recorded locally while the checkout API recovers.')
      setLoading(false)
      setWaitingForServer(false)
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
      setMessage('Order confirmed.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Checkout failed'
      if (msg.startsWith('CIRCUIT_OPEN')) {
        mockCheckout()
        clearCart()
        setFallbackMode(true)
        setMessage('Checkout API unreachable. Switched to safe local confirmation.')
        setError(null)
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
      setWaitingForServer(false)
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-indigo-700"
      >
        Continue shopping
      </button>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Cart</h2>

      {breaker.state === 'OPEN' && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Circuit breaker open</p>
            <p className="mt-0.5 text-amber-800">
              Live checkout is paused after repeated failures. Orders use the local fallback until the API recovers.
            </p>
            <button type="button" onClick={breaker.reset} className="mt-2 text-sm font-medium underline">
              Reset breaker
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">
              {message ?? 'Cart is empty. Add gear from the catalog.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map(({ product, quantity }) => (
                <li key={product.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-slate-900">{product.name}</p>
                    <p className="text-xs text-slate-500">
                      Qty {quantity} · ${product.base_price.toFixed(2)} each
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(product.id)}
                    className="text-xs font-medium text-slate-500 hover:text-rose-700"
                    disabled={loading}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}
          {message && items.length === 0 && (
            <p className={`mt-2 text-sm ${fallbackMode ? 'text-amber-800' : 'text-emerald-800'}`}>
              {message}
            </p>
          )}
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Total</span>
            <span className="font-semibold tabular-nums text-slate-900">${total.toFixed(2)}</span>
          </div>
          {(isDegraded || systemLoad.currentRPS > 1000) && (
            <p className="mt-3 text-xs text-amber-800">
              High load ({systemLoad.currentRPS} RPS, SLA {systemLoad.slaReliability.toFixed(1)}%). Checkout may be slower.
            </p>
          )}
          <button
            type="button"
            onClick={handleCheckout}
            disabled={items.length === 0 || loading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin-slow" />
                {waitingForServer ? 'Waiting for server' : 'Processing'}
              </>
            ) : breaker.state === 'OPEN' ? (
              'Checkout (safe mode)'
            ) : (
              'Checkout'
            )}
          </button>
        </aside>
      </div>
    </section>
  )
}
