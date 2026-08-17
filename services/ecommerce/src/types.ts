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
  activeServers: number
  violations: number
  slaReliability: number
  status: 'IDLE' | 'SIMULATING' | 'FINISHED'
  predictedUpper: number
  pendingTicks: number
}

export const DEFAULT_SYSTEM_LOAD: SystemLoad = {
  currentRPS: 50,
  activeServers: 10,
  violations: 0,
  slaReliability: 100,
  status: 'IDLE',
  predictedUpper: 0,
  pendingTicks: 0,
}