import { ShoppingBag } from 'lucide-react'
import { useCart } from '../context/CartContext'

interface NavbarProps {
  onOpenCart: () => void
}

export function Navbar({ onOpenCart }: NavbarProps) {
  const { itemCount } = useCart()

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 border-b border-[var(--color-edge)] bg-[var(--color-ink)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
        <div className="flex items-baseline gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight text-[var(--color-snow)]">
            Nexus<span className="text-[var(--color-accent)]">Gear</span>
          </h1>
          <span className="hidden text-xs uppercase tracking-[0.2em] text-[var(--color-mist)] sm:inline">
            Performance Store
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenCart}
          className="relative flex items-center gap-2 rounded-md border border-[var(--color-edge)] bg-[var(--color-panel)] px-3 py-2 text-sm font-medium text-[var(--color-snow)] transition hover:border-[var(--color-accent-dim)] hover:text-[var(--color-accent)]"
          aria-label="Open cart"
        >
          <ShoppingBag className="h-4 w-4" />
          Cart
          {itemCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-xs font-bold text-[var(--color-ink)]">
              {itemCount}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}
