import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_SYSTEM_LOAD,
  type SystemLoad,
} from '../types'

const SIMULATOR_URL =
  import.meta.env.VITE_SIMULATOR_URL ?? 'http://localhost:8083'

const CLOUD_METRICS_URL =
  import.meta.env.VITE_CLOUD_METRICS_URL ?? ''

const TELEMETRY_MODE = (
  import.meta.env.VITE_TELEMETRY_MODE ?? 'simulator'
).toLowerCase()

function resolveMetricsUrl(): string {
  if (TELEMETRY_MODE === 'cloud' && CLOUD_METRICS_URL) {
    return CLOUD_METRICS_URL
  }

  return `${SIMULATOR_URL}/metrics`
}

function parseMetricsPayload(
  data: Record<string, unknown>,
): SystemLoad {
  const predictedUpperData = data.predicted_upper

  let predictedUpper = 0

  if (Array.isArray(predictedUpperData)) {
    const numbers = predictedUpperData
      .map(Number)
      .filter((value) => Number.isFinite(value))

    if (numbers.length > 0) {
      predictedUpper = Math.max(...numbers)
    }
  } else if (typeof predictedUpperData === 'number') {
    predictedUpper = predictedUpperData
  }

  const rawStatus = String(data.status ?? 'IDLE').toUpperCase()

  const status: SystemLoad['status'] =
    rawStatus === 'SIMULATING'
      ? 'SIMULATING'
      : rawStatus === 'FINISHED'
        ? 'FINISHED'
        : 'IDLE'

  return {
    currentRPS: Number(data.current_rps ?? data.currentRPS ?? 0),
    activeServers: Number(data.active_servers ?? data.activeServers ?? 1),
    violations: Number(data.violations ?? data.sla_violations ?? 0),
    slaReliability: Number(
      data.sla_reliability ?? data.slaReliability ?? 100,
    ),
    status,
    predictedUpper,
    pendingTicks: Number(data.pending_ticks ?? data.pendingTicks ?? 0),
  }
}

interface SystemLoadContextValue {
  load: SystemLoad
  connected: boolean
  metricsUrl: string
}

const SystemLoadContext = createContext<SystemLoadContextValue>({
  load: DEFAULT_SYSTEM_LOAD,
  connected: false,
  metricsUrl: resolveMetricsUrl(),
})

export function SystemLoadProvider({
  children,
  pollMs = 1000,
}: {
  children: ReactNode
  pollMs?: number
}) {
  const metricsUrl = resolveMetricsUrl()
  const [load, setLoad] = useState<SystemLoad>(DEFAULT_SYSTEM_LOAD)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let cancelled = false

    const fetchMetrics = async () => {
      try {
        const response = await fetch(metricsUrl, { cache: 'no-store' })

        if (!response.ok) {
          setConnected(false)
          return
        }

        const data = (await response.json()) as Record<string, unknown>

        if (cancelled) {
          return
        }

        const parsed = parseMetricsPayload(data)
        setLoad(parsed)
        setConnected(true)

        console.log(
          '[SystemLoad]',
          `url=${metricsUrl}`,
          `RPS=${parsed.currentRPS}`,
          `status=${parsed.status}`,
          `SLA=${parsed.slaReliability.toFixed(2)}%`,
          `violations=${parsed.violations}`,
        )
      } catch (err) {
        setConnected(false)
        console.warn('[SystemLoad] poll failed:', err)
      }
    }

    fetchMetrics()
    const intervalId = window.setInterval(fetchMetrics, pollMs)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [metricsUrl, pollMs])

  return (
    <SystemLoadContext.Provider value={{ load, connected, metricsUrl }}>
      {children}
    </SystemLoadContext.Provider>
  )
}

export function useSystemLoadContext(): SystemLoadContextValue {
  return useContext(SystemLoadContext)
}
