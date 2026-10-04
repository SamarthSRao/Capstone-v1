import { ShoppingBag } from 'lucide-react'
import { useCart } from '../context/CartContext'

interface NavbarProps {
  query: string
  onQuery: (value: string) => void
  onHome: () => void
  onOpenCart: () => void
}

export function Navbar({ query, onQuery, onHome, onOpenCart }: NavbarProps) {
  const { itemCount } = useCart()

  return (
    <header className="fixed top-0 right-0 left-0 z-40 h-16 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-4 px-6">
        <button
          type="button"
          onClick={onHome}
          className="shrink-0 text-left"
        >
          <span className="text-base font-semibold tracking-tight text-slate-900">
            NexusGear
          </span>
        </button>

        <label className="relative min-w-0 flex-1 sm:mx-auto sm:max-w-md">
          <span className="sr-only">Search products</span>
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search products"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white"
          />
        </label>

        <button
          type="button"
          onClick={onOpenCart}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:border-slate-300"
          aria-label="Open cart"
        >
          <ShoppingBag className="h-4 w-4" />
          Cart
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-indigo-50 px-1.5 text-xs font-semibold text-indigo-700">
            {itemCount}
          </span>
        </button>
      </div>
    </header>
  )
}
