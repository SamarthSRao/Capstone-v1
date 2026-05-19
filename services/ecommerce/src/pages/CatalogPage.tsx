import { PRODUCTS } from '../data/products'
import { ProductCard } from '../components/ProductCard'
import { useSystemLoad } from '../hooks/useSystemLoad'
import { getPricingTier } from '../utils/pricing'

export const CatalogPage = () => {
  const load = useSystemLoad()
  const pricing = getPricingTier(load.currentRPS)

  return (
    <main className="max-w-7xl mx-auto px-6 pt-24 pb-16">
      <div className="mb-8">
        <h1 className="font-['Space_Grotesk'] text-3xl font-bold text-white">Product Catalog</h1>
        <p className="text-nexus-muted mt-1">Premium tech hardware, shipped to the future.</p>
        <p className="text-nexus-muted text-xs mt-2">
          Live load: {load.currentRPS.toLocaleString()} RPS · {load.status}
        </p>
      </div>

      {pricing && (
        <div
          className="mb-6 px-4 py-3 rounded-xl border border-orange-500/30 bg-orange-500/10
                     flex items-center gap-3 animate-fade-in"
        >
          <span className="text-orange-400 font-medium text-sm">
            {pricing.label} — Prices have increased{' '}
            {Math.round((pricing.multiplier - 1) * 100)}% due to extreme demand. Current load:{' '}
            {load.currentRPS.toLocaleString()} RPS.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {PRODUCTS.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            priceMultiplier={pricing?.multiplier ?? 1}
            surgeLabel={pricing?.label}
          />
        ))}
      </div>
    </main>
  )
}
