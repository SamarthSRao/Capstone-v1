import { useCart } from '../context/CartContext'
import { useCatalog } from '../context/CatalogContext'
import { useDynamicPricing } from '../hooks/useDynamicPricing'
import { ProductArt } from './ProductArt'

interface ProductDetailProps {
  productId: number
  onBack: () => void
}

export function ProductDetail({ productId, onBack }: ProductDetailProps) {
  const { products } = useCatalog()
  const { addItem } = useCart()
  const pricing = useDynamicPricing()
  const product = products.find((item) => item.id === productId)

  if (!product) {
    return (
      <section className="mx-auto max-w-6xl px-6 py-16">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-indigo-700"
        >
          Back to catalog
        </button>
        <p className="mt-6 text-sm text-slate-500">This product is not in the catalog.</p>
      </section>
    )
  }

  const displayPrice = Number(product.base_price) * pricing.multiplier

  return (
    <section className="mx-auto max-w-6xl px-6 py-8">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-indigo-700"
      >
        Back to catalog
      </button>
      <div className="mt-6 grid gap-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <ProductArt name={product.name} />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {product.category}
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {product.name}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{product.description}</p>
          <p className="mt-6 text-2xl font-semibold tabular-nums text-slate-900">
            ${displayPrice.toFixed(2)}
          </p>
          {pricing.isHighDemand && (
            <p className="mt-1 text-sm text-slate-400 line-through">
              ${Number(product.base_price).toFixed(2)}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">{product.stock} in stock</p>
          <button
            type="button"
            onClick={() => addItem(product)}
            className="mt-6 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add to cart
          </button>
        </div>
      </div>
    </section>
  )
}
