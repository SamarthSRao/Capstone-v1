import { Plus } from 'lucide-react'
import type { Product } from '../data/products'
import { useCart } from '../context/CartContext'

interface Props {
  product: Product
  priceMultiplier?: number
  surgeLabel?: string
}

export const ProductCard = ({
  product,
  priceMultiplier = 1,
  surgeLabel,
}: Props) => {
  const { addItem } = useCart()
  const displayPrice = (product.basePrice * priceMultiplier).toFixed(2)
  const isSurging = priceMultiplier > 1

  return (
    <div
      className="group relative bg-gradient-to-b from-white/[0.04] to-white/[0.01]
                 border border-nexus-border rounded-xl p-5
                 hover:-translate-y-1 hover:border-nexus-primary/40
                 hover:shadow-[0_8px_32px_rgba(99,102,241,0.15)]
                 transition-all duration-300 animate-fade-in"
    >
      <div
        className="h-40 bg-white/[0.03] rounded-lg mb-4 flex items-center justify-center
                   border border-nexus-border"
      >
        <div className="text-4xl opacity-20">⬡</div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-nexus-muted uppercase tracking-wider">{product.category}</span>
        {product.badge && (
          <span className="text-xs bg-nexus-primary/20 text-nexus-primary px-2 py-0.5 rounded-full">
            {product.badge}
          </span>
        )}
      </div>

      <h3 className="text-white font-semibold mb-1 leading-tight">{product.name}</h3>
      <p className="text-nexus-muted text-xs mb-4 line-clamp-2">{product.description}</p>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-xl font-bold text-white">${displayPrice}</div>
          {isSurging && (
            <div className="text-xs text-nexus-muted line-through">
              ${product.basePrice.toFixed(2)}
            </div>
          )}
        </div>
        {surgeLabel && (
          <span
            className="text-xs px-2 py-1 rounded-full font-medium
                       bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse"
          >
            {surgeLabel}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => addItem(product)}
        className="mt-4 w-full flex items-center justify-center gap-2
                   bg-nexus-primary hover:bg-nexus-primary-hover
                   text-white rounded-lg py-2.5 font-medium text-sm transition-colors duration-200"
      >
        <Plus className="w-4 h-4" strokeWidth={2} />
        Add to Cart
      </button>
    </div>
  )
}
