import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Product } from '../types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

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
    description: 'GPS and heart-rate training computer.',
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
    description: 'Rechargeable trail beam.',
    stock: 35,
  },
]

interface CatalogValue {
  products: Product[]
  source: 'api' | 'fallback'
}

const CatalogContext = createContext<CatalogValue>({
  products: FALLBACK_PRODUCTS,
  source: 'fallback',
})

export function CatalogProvider({ children }: { children: ReactNode }) {
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
        // Keep the local catalog when the API is down.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <CatalogContext.Provider value={{ products, source }}>
      {children}
    </CatalogContext.Provider>
  )
}

export function useCatalog() {
  return useContext(CatalogContext)
}
