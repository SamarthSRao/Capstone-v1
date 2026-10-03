import { useState } from 'react'
import { CartProvider } from './context/CartContext'
import { CatalogProvider } from './context/CatalogContext'
import { SystemLoadProvider } from './context/SystemLoadContext'
import { SystemStatusBanner } from './components/SystemStatusBanner'
import { ChaosAlertPanel } from './components/ChaosAlertPanel'
import { Navbar } from './components/Navbar'
import { CartPage } from './components/CartPage'
import { ProductDetail } from './components/ProductDetail'
import { ProductGrid } from './components/ProductGrid'

type View =
  | { name: 'catalog' }
  | { name: 'product'; id: number }
  | { name: 'cart' }

function App() {
  const [view, setView] = useState<View>({ name: 'catalog' })
  const [query, setQuery] = useState('')

  return (
    <SystemLoadProvider pollMs={1000}>
      <CatalogProvider>
        <CartProvider>
          <Navbar
            query={query}
            onQuery={setQuery}
            onHome={() => setView({ name: 'catalog' })}
            onOpenCart={() => setView({ name: 'cart' })}
          />
          <SystemStatusBanner />
          <main className="pt-16">
            <ChaosAlertPanel />
            {view.name === 'catalog' && (
              <ProductGrid
                query={query}
                onOpen={(id) => setView({ name: 'product', id })}
              />
            )}
            {view.name === 'product' && (
              <ProductDetail
                productId={view.id}
                onBack={() => setView({ name: 'catalog' })}
              />
            )}
            {view.name === 'cart' && (
              <CartPage onBack={() => setView({ name: 'catalog' })} />
            )}
          </main>
        </CartProvider>
      </CatalogProvider>
    </SystemLoadProvider>
  )
}

export default App
