import { ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { useCart } from '../context/CartContext'
import { CartDrawer } from './CartDrawer'

export const Navbar = () => {
  const { count } = useCart()
  const [cartOpen, setCartOpen] = useState(false)

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-40 border-b border-nexus-border
                   bg-nexus-bg/80 backdrop-blur-md"
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg bg-nexus-primary flex items-center justify-center
                         text-white font-bold text-sm"
            >
              N
            </div>
            <span className="font-['Space_Grotesk'] font-semibold text-lg text-white">NexusGear</span>
            <span className="text-nexus-muted text-xs ml-2">Premium Tech Store</span>
          </div>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative p-2 rounded-lg hover:bg-white/5 transition-colors"
            aria-label="Open cart"
          >
            <ShoppingCart className="w-5 h-5 text-nexus-text" strokeWidth={1.5} />
            {count > 0 && (
              <span
                className="absolute -top-1 -right-1 w-5 h-5 bg-nexus-primary text-white text-xs
                           rounded-full flex items-center justify-center font-medium"
              >
                {count}
              </span>
            )}
          </button>
        </div>
      </nav>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </>
  )
}
