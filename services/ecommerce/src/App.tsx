import { CartProvider } from './context/CartContext'
import { Navbar } from './components/Navbar'
import { CatalogPage } from './pages/CatalogPage'
import { SystemStatusBanner } from './components/SystemStatusBanner'

export default function App() {
  return (
    <CartProvider>
      <div className="min-h-screen bg-nexus-bg">
        <Navbar />
        <SystemStatusBanner />
        <CatalogPage />
      </div>
    </CartProvider>
  )
}
