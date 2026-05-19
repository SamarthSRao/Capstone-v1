import { Loader2, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useCart } from '../context/CartContext'
import { useSystemLoad } from '../hooks/useSystemLoad'
import {
  checkoutItem,
  getCheckoutDelayMs,
  getCheckoutStatusMessage,
} from '../utils/checkout'
import { getPricingTier } from '../utils/pricing'

interface Props {
  open: boolean
  onClose: () => void
}

export const CartDrawer = ({ open, onClose }: Props) => {
  const { items, removeItem, clearCart, total, count } = useCart()
  const load = useSystemLoad()
  const pricing = getPricingTier(load.currentRPS)
  const multiplier = pricing?.multiplier ?? 1
  const displayTotal = (total * multiplier).toFixed(2)

  const [checkingOut, setCheckingOut] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCheckout = async () => {
    if (items.length === 0) return
    setCheckingOut(true)
    setError(null)
    const delayMs = getCheckoutDelayMs(load)
    setStatusMsg(getCheckoutStatusMessage(load, delayMs))

    try {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs))
      }
      for (const item of items) {
        const result = await checkoutItem(item.id, item.quantity, 0)
        if (!result.ok) {
          setError(result.message)
          setCheckingOut(false)
          setStatusMsg(null)
          return
        }
      }
      clearCart()
      setStatusMsg('All orders confirmed — thank you!')
      setTimeout(() => {
        setStatusMsg(null)
        onClose()
      }, 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed')
    } finally {
      setCheckingOut(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed top-0 right-0 h-full w-full max-w-md bg-nexus-surface border-l
                   border-nexus-border z-50 flex flex-col animate-slide-down shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-nexus-border">
          <h2 className="font-['Space_Grotesk'] text-lg font-semibold text-white">
            Cart ({count})
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 text-nexus-muted"
            aria-label="Close cart"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {items.length === 0 ? (
            <p className="text-nexus-muted text-sm text-center py-12">Your cart is empty.</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 p-3 rounded-lg bg-white/[0.03] border border-nexus-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{item.name}</p>
                  <p className="text-nexus-muted text-xs">Qty: {item.quantity}</p>
                  <p className="text-nexus-primary text-sm font-semibold mt-1">
                    ${(item.basePrice * multiplier * item.quantity).toFixed(2)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="p-2 text-nexus-muted hover:text-red-400 self-start"
                  aria-label={`Remove ${item.name}`}
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-nexus-border px-6 py-4 space-y-3">
          {statusMsg && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              {statusMsg}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-between text-white font-semibold">
            <span>Total</span>
            <span>${displayTotal}</span>
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={items.length === 0 || checkingOut}
            className="w-full flex items-center justify-center gap-2 bg-nexus-primary
                       hover:bg-nexus-primary-hover disabled:opacity-50 disabled:cursor-not-allowed
                       text-white rounded-lg py-3 font-medium text-sm transition-colors"
          >
            {checkingOut ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing…
              </>
            ) : (
              'Checkout'
            )}
          </button>

          {items.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              disabled={checkingOut}
              className="w-full text-nexus-muted hover:text-white text-sm py-2"
            >
              Clear Cart
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
