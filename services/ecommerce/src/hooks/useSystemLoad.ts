import { useSystemLoadContext } from '../context/SystemLoadContext'
import { type SystemLoad } from '../types'

/**
 * Shared simulator telemetry — single poll via SystemLoadProvider.
 * Local: http://localhost:8083/metrics
 */
export function useSystemLoad(_pollMs = 1000): SystemLoad {
  return useSystemLoadContext().load
}

export function useCloudTelemetry(pollMs = 1000): SystemLoad {
  return useSystemLoad(pollMs)
}
