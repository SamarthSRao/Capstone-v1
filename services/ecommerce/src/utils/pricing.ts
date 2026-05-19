export interface PricingTier {
  multiplier: number
  label: string
  badgeClass: string
}

export const getPricingTier = (rps: number): PricingTier | null => {
  if (rps > 2000) {
    return {
      multiplier: 1.3,
      label: '🔥 High Demand',
      badgeClass: 'bg-red-500/20 text-red-400 border border-red-500/30',
    }
  }
  if (rps > 1000) {
    return {
      multiplier: 1.15,
      label: '⚡ Surge Pricing',
      badgeClass: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    }
  }
  return null
}
