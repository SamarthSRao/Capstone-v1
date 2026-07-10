import { useEffect, useState } from 'react'
import { useCart } from '../context/CartContext'
import { useDynamicPricing } from '../hooks/useDynamicPricing'
import type { Product } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

/** Fallback catalog when the API / DB is not running yet */
const FALLBACK_PRODUCTS: Product[] = [
  {
    id: 1,
    name: 'AeroStride Runners',
    category: 'Footwear',
    base_price: 149.0,
    description: 'Lightweight carbon-plate racing shoes.',
    stock: 40,
  },
  {
    id: 2,
    name: 'PulseForge Watch',
    category: 'Wearables',
    base_price: 229.0,
    description: 'GPS + HRV training computer.',
    stock: 25,
  },
  {
    id: 3,
    name: 'VoltPack Hydration',
    category: 'Accessories',
    base_price: 48.0,
    description: 'Insulated soft flask vest.',
    stock: 60,
  },
  {
    id: 4,
    name: 'SummitShell Jacket',
    category: 'Apparel',
    base_price: 189.0,
    description: 'Windproof shell for alpine efforts.',
    stock: 18,
  },
  {
    id: 5,
    name: 'CoreBand Resistance',
    category: 'Training',
    base_price: 32.0,
    description: 'Progressive resistance loop set.',
    stock: 80,
  },
  {
    id: 6,
    name: 'NightTrail Headlamp',
    category: 'Accessories',
    base_price: 64.0,
    description: '1200-lumen rechargeable beam.',
    stock: 35,
  },
]

export function ProductGrid() {
  const { addItem } = useCart()
  const pricing = useDynamicPricing()
  const [products, setProducts] = useState<Product[]>(FALLBACK_PRODUCTS)
  const [source, setSource] = useState<'api' | 'fallback'>('fallback')

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/products`)
        if (!res.ok) return
        const data = (await res.json()) as Product[]
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setProducts(data)
          setSource('api')
        }
      } catch {
        // Keep fallback catalog
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="mx-auto max-w-6xl px-6 pb-20 pt-10">
      <div className="mb-10 max-w-xl">
        <p className="mb-2 text-xs uppercase tracking-[0.25em] text-[var(--color-accent)]">
          Catalog
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight sm:text-5xl">
          Built for the surge
        </h2>
        <p className="mt-3 text-[var(--color-mist)]">
          Premium performance gear. Live checkout traffic feeds the HybridTimeNet
          autoscaling loop.
          {source === 'fallback' && (
            <span className="ml-1 text-xs text-[var(--color-warn)]">
              (showing demo catalog — API offline)
            </span>
          )}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const displayPrice =
            Number(product.base_price) * pricing.multiplier
          const priceClass = pricing.isChaos
            ? 'text-red-400'
            : pricing.isHighDemand
              ? 'text-[var(--color-warn)]'
              : 'text-[var(--color-accent)]'
          const badgeClass = pricing.isChaos
            ? 'border-red-500 bg-red-600 text-white'
            : 'border-[var(--color-warn)]/50 bg-[var(--color-warn)]/15 text-[var(--color-warn)]'
          const cardBorder = pricing.isChaos
            ? 'border-red-500/40 hover:border-red-400'
            : 'border-[var(--color-edge)] hover:border-[var(--color-accent-dim)]'

          return (
            <article
              key={product.id}
              className={`group flex flex-col border bg-[var(--color-panel)]/80 p-5 transition ${cardBorder}`}
            >
              <div className="mb-4 aspect-[4/3] bg-gradient-to-br from-[var(--color-edge)] to-[var(--color-ink)]" />
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs uppercase tracking-wider text-[var(--color-mist)]">
                  {product.category}
                </p>
                {pricing.badgeLabel && (
                  <span
                    className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeClass}`}
                  >
                    {pricing.badgeLabel}
                  </span>
                )}
              </div>
              <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold">
                {product.name}
              </h3>
              <p className="mt-2 flex-1 text-sm text-[var(--color-mist)]">
                {product.description}
              </p>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <span className={`text-lg font-semibold ${priceClass}`}>
                    ${displayPrice.toFixed(2)}
                  </span>
                  {pricing.isHighDemand && (
                    <span className="ml-2 text-xs text-[var(--color-mist)] line-through">
                      ${Number(product.base_price).toFixed(2)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => addItem(product)}
                  className="rounded-md border border-[var(--color-edge)] px-3 py-1.5 text-sm font-medium transition group-hover:border-[var(--color-accent)] group-hover:text-[var(--color-accent)]"
                >
                  Add to cart
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
