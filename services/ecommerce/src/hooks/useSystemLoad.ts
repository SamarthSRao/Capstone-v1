import { useState, useEffect } from 'react'

export type SimStatus = 'IDLE' | 'SIMULATING' | 'FINISHED'

export interface SystemLoad {
  currentRPS: number
  activeServers: number
  violations: number
  slaReliability: number
  status: SimStatus
  predictedUpper: number
  pendingTicks: number
}

const DEFAULT: SystemLoad = {
  currentRPS: 0,
  activeServers: 2,
  violations: 0,
  slaReliability: 100,
  status: 'IDLE',
  predictedUpper: 0,
  pendingTicks: 0,
}

const SIMULATOR_URL = import.meta.env.VITE_SIMULATOR_URL || 'http://localhost:8083'

export const useSystemLoad = (): SystemLoad => {
  const [load, setLoad] = useState<SystemLoad>(DEFAULT)

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${SIMULATOR_URL}/metrics`)
        const data = await res.json()
        setLoad({
          currentRPS: data.current_rps ?? 0,
          activeServers: data.active_servers ?? 2,
          violations: data.violations ?? 0,
          slaReliability: data.sla_reliability ?? 100,
          status: (data.status ?? 'IDLE') as SimStatus,
          predictedUpper: data.predicted_upper?.length
            ? Math.max(...data.predicted_upper)
            : 0,
          pendingTicks: data.pending_ticks ?? 0,
        })
      } catch {
        // Simulator offline — keep last known state
      }
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [])

  return load
}
