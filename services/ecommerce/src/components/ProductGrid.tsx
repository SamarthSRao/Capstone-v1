import { useCart } from '../context/CartContext'
import { useCatalog } from '../context/CatalogContext'
import { useDynamicPricing } from '../hooks/useDynamicPricing'
import { ProductArt } from './ProductArt'

interface ProductGridProps {
  query: string
  onOpen: (id: number) => void
}

export function ProductGrid({ query, onOpen }: ProductGridProps) {
  const { addItem } = useCart()
  const { products, source } = useCatalog()
  const pricing = useDynamicPricing()
  const needle = query.trim().toLowerCase()
  const visible = needle
    ? products.filter((product) =>
        `${product.name} ${product.category} ${product.description}`
          .toLowerCase()
          .includes(needle),
      )
    : products

  return (
    <section className="mx-auto max-w-6xl px-6 pt-8 pb-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Catalog
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Performance gear for training and trail.
            {source === 'fallback' ? ' Showing the local catalog.' : ''}
          </p>
        </div>
        <p className="text-xs text-slate-500">{visible.length} products</p>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-800">No matching products</p>
          <p className="mt-1 text-xs text-slate-500">Try another search.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((product) => {
            const displayPrice = Number(product.base_price) * pricing.multiplier
            return (
              <article
                key={product.id}
                className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => onOpen(product.id)}
                  className="text-left"
                >
                  <ProductArt name={product.name} />
                  <p className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {product.category}
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">
                    {product.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                    {product.description}
                  </p>
                </button>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-base font-semibold tabular-nums text-slate-900">
                      ${displayPrice.toFixed(2)}
                    </span>
                    {pricing.isHighDemand && (
                      <span className="ml-2 text-xs text-slate-400 line-through">
                        ${Number(product.base_price).toFixed(2)}
                      </span>
                    )}
                    {pricing.badgeLabel && (
                      <p className="mt-1">
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          {pricing.badgeLabel}
                        </span>
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => addItem(product)}
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Add
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
