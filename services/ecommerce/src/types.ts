export interface Product {
  id: number
  name: string
  category: string
  base_price: number
  description: string
  stock: number
}

export interface CartItem {
  product: Product
  quantity: number
}

export interface SystemLoad {
  currentRPS: number
  violations: number
  slaReliability: number
  status: string
  activeServers?: number
}

export const DEFAULT_SYSTEM_LOAD: SystemLoad = {
  currentRPS: 0,
  violations: 0,
  slaReliability: 100,
  status: 'IDLE',
  activeServers: 1,
}
