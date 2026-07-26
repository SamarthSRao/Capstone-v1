import { useEffect, useState } from 'react'
import { DEFAULT_SYSTEM_LOAD, type SystemLoad } from '../types'

const SIMULATOR_URL =
  import.meta.env.VITE_SIMULATOR_URL ?? 'http://localhost:8083'
const CLOUD_METRICS_URL = import.meta.env.VITE_CLOUD_METRICS_URL ?? ''
const TELEMETRY_MODE = (
  import.meta.env.VITE_TELEMETRY_MODE ?? 'simulator'
).toLowerCase()

function resolveMetricsUrl(): string {
  // HT-605: in cloud mode, prefer the CloudWatch-backed metrics proxy URL.
  // The proxy (API Gateway / orchestrator) returns the same JSON shape as
  // the local simulator `/metrics` endpoint so pricing + chaos UI stay wired.
  if (TELEMETRY_MODE === 'cloud' && CLOUD_METRICS_URL) {
    return CLOUD_METRICS_URL
  }
  return `${SIMULATOR_URL}/metrics`
}

function parseMetricsPayload(data: Record<string, unknown>): SystemLoad {
  return {
    currentRPS: Number(data.currentRPS ?? data.current_rps ?? 0),
    violations: Number(data.violations ?? data.sla_violations ?? 0),
    slaReliability: Number(
      data.slaReliability ?? data.sla_reliability ?? 100,
    ),
    status: String(data.status ?? 'IDLE'),
    activeServers: Number(data.activeServers ?? data.active_servers ?? 1),
  }
}

/**
 * Polls live system load for the storefront.
 * - Local (default): Go Simulator `GET /metrics`
 * - Cloud (HT-605): `VITE_CLOUD_METRICS_URL` (CloudWatch-backed proxy)
 *
 * Dynamic pricing, SystemStatusBanner, and ChaosAlertPanel all consume this.
 */
export function useSystemLoad(pollMs = 1000): SystemLoad {
  const [load, setLoad] = useState<SystemLoad>(DEFAULT_SYSTEM_LOAD)

  useEffect(() => {
    let cancelled = false
    const url = resolveMetricsUrl()

    const fetchMetrics = async () => {
      try {
        const res = await fetch(url)
        if (!res.ok) return

        const data = (await res.json()) as Record<string, unknown>
        if (cancelled) return

        setLoad(parseMetricsPayload(data))
      } catch {
        // Metrics source may be offline during local UI work — keep last known
      }
    }

    fetchMetrics()
    const id = window.setInterval(fetchMetrics, pollMs)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [pollMs])

  return load
}

/** Explicit alias used by cloud-reactive UI (HT-605). */
export function useCloudTelemetry(pollMs = 1000): SystemLoad {
  return useSystemLoad(pollMs)
}
