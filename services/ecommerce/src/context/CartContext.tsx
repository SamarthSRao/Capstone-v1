import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { CartItem, Product } from '../types'

interface CartContextValue {
  items: CartItem[]
  itemCount: number
  total: number
  addItem: (product: Product) => void
  removeItem: (productId: number) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  const addItem = useCallback((product: Product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }, [])

  const removeItem = useCallback((productId: number) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId))
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const value = useMemo(() => {
    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)
    const total = items.reduce(
      (sum, i) => sum + i.product.base_price * i.quantity,
      0,
    )
    return { items, itemCount, total, addItem, removeItem, clearCart }
  }, [items, addItem, removeItem, clearCart])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
