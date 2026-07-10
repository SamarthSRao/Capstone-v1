import { useState } from 'react'
import { CartProvider } from './context/CartContext'
import { SystemStatusBanner } from './components/SystemStatusBanner'
import { ChaosAlertPanel } from './components/ChaosAlertPanel'
import { Navbar } from './components/Navbar'
import { CartDrawer } from './components/CartDrawer'
import { ProductGrid } from './components/ProductGrid'

function App() {
  const [cartOpen, setCartOpen] = useState(false)

  return (
    <CartProvider>
      <Navbar onOpenCart={() => setCartOpen(true)} />
      {/* HT-306: slides in below the navbar when SLA degrades */}
      <SystemStatusBanner />
      <main className="pt-16">
        {/* HT-403: in-page chaos panel when SLA < 98% */}
        <ChaosAlertPanel />
        <ProductGrid />
      </main>
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </CartProvider>
  )
}

export default App
