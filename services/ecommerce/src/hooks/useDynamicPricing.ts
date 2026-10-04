import { useMemo } from 'react'
import { useSystemLoad } from './useSystemLoad'

export interface DynamicPricing {
  multiplier: number
  isHighDemand: boolean
  isChaos: boolean
  badgeLabel: string | null
}

export function useDynamicPricing(): DynamicPricing {
  const {
    currentRPS,
    slaReliability,
  } = useSystemLoad()

  return useMemo(() => {
    let multiplier = 1
    let badgeLabel: string | null = null

    if (currentRPS > 2000) {
      multiplier = 1.30
      badgeLabel = 'High demand +30%'
    } else if (currentRPS > 1000) {
      multiplier = 1.15
      badgeLabel = 'Surge pricing +15%'
    }

    const isHighDemand = multiplier > 1

    const isChaos = slaReliability < 98

    return {
      multiplier,
      isHighDemand,
      isChaos,
      badgeLabel,
    }
  }, [currentRPS, slaReliability])
}