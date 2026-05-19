export interface Product {
  id: number
  name: string
  category: string
  basePrice: number
  description: string
  badge?: string
}

export const PRODUCTS: Product[] = [
  { id: 1, name: 'Quantum Processor X1', category: 'Computing', basePrice: 1299, description: 'Next-gen 128-core AI processing unit' },
  { id: 2, name: 'Neural Link Headset', category: 'Wearables', basePrice: 499, description: 'Direct neural interface, 4ms latency' },
  { id: 3, name: 'HoloDisplay 8K', category: 'Displays', basePrice: 2199, description: '32-inch holographic floating display' },
  { id: 4, name: 'CryoStorage 100TB', category: 'Storage', basePrice: 799, description: 'Superconducting cold storage array' },
  { id: 5, name: 'Photon GPU Cluster', category: 'Computing', basePrice: 3499, description: 'Light-based parallel compute cluster' },
  { id: 6, name: 'BioSync Smartwatch', category: 'Wearables', basePrice: 349, description: 'Real-time biometric sync + health AI' },
  { id: 7, name: 'Plasma Router Pro', category: 'Networking', basePrice: 599, description: '1Tbps mesh networking node' },
  { id: 8, name: 'QuantumVault Encryptor', category: 'Security', basePrice: 899, description: 'Post-quantum encryption hardware key' },
  { id: 9, name: 'SynapseRAM 512GB', category: 'Computing', basePrice: 1099, description: 'Neuromorphic memory architecture' },
  { id: 10, name: 'Orbital Mesh Antenna', category: 'Networking', basePrice: 449, description: 'Low-latency satellite uplink hardware' },
  { id: 11, name: 'DynaFrame Exoskeleton', category: 'Wearables', basePrice: 5999, description: 'Lightweight carbon-fiber assist frame', badge: 'New' },
  { id: 12, name: 'FluxCore Battery Pack', category: 'Energy', basePrice: 299, description: '2MWh solid-state portable power cell' },
]
