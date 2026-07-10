import { useMemo } from 'react'
import { useSystemLoad } from './useSystemLoad'

export interface DynamicPricing {
  /** Multiplier applied to base_price (1.0 = normal) */
  multiplier: number
  /** True when surge pricing is active */
  isHighDemand: boolean
  /** True when SLA < 98% — chaos / distress styling */
  isChaos: boolean
  /** Human-readable badge label, or null when calm */
  badgeLabel: string | null
}

/**
 * HT-403 — Maps live simulator load into storefront price multipliers
 * and chaos styling flags. Pure UI; does not change backend prices.
 */
export function useDynamicPricing(): DynamicPricing {
  const { currentRPS, slaReliability } = useSystemLoad()

  return useMemo(() => {
    const isChaos = slaReliability < 98

    let multiplier = 1
    if (currentRPS > 2000) {
      multiplier = 1.2
    } else if (currentRPS > 1000) {
      multiplier = 1.1
    }

    // Under critical SLA, lock to max surge so the demo reads clearly
    if (isChaos && multiplier < 1.2) {
      multiplier = 1.2
    }

    const isHighDemand = multiplier > 1

    let badgeLabel: string | null = null
    if (isChaos) {
      badgeLabel = 'System Stress Pricing'
    } else if (currentRPS > 2000) {
      badgeLabel = 'High Demand Pricing +20%'
    } else if (currentRPS > 1000) {
      badgeLabel = 'Elevated Demand +10%'
    }

    return { multiplier, isHighDemand, isChaos, badgeLabel }
  }, [currentRPS, slaReliability])
}
