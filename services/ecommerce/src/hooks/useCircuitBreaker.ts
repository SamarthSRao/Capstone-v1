import { useCallback, useRef, useState } from 'react'

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  /** Failures required to trip the breaker */
  failureThreshold?: number
  /** How long to stay OPEN before allowing a probe (ms) */
  resetTimeoutMs?: number
}

export interface CircuitBreakerApi {
  state: CircuitState
  failures: number
  /** Run an async action through the breaker */
  execute: <T>(action: () => Promise<T>) => Promise<T>
  /** Force reset to CLOSED (e.g. after user dismisses notice) */
  reset: () => void
}

/**
 * HT-704 — Client-side circuit breaker for checkout / API calls.
 * After `failureThreshold` consecutive failures, trips OPEN and rejects
 * new network attempts until `resetTimeoutMs` elapses (then HALF_OPEN probe).
 */
export function useCircuitBreaker(
  options: CircuitBreakerOptions = {},
): CircuitBreakerApi {
  const failureThreshold = options.failureThreshold ?? 3
  const resetTimeoutMs = options.resetTimeoutMs ?? 10_000

  const [state, setState] = useState<CircuitState>('CLOSED')
  const [failures, setFailures] = useState(0)
  const openedAt = useRef<number | null>(null)

  const reset = useCallback(() => {
    openedAt.current = null
    setFailures(0)
    setState('CLOSED')
  }, [])

  const execute = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      const now = Date.now()

      if (state === 'OPEN') {
        if (
          openedAt.current != null &&
          now - openedAt.current >= resetTimeoutMs
        ) {
          setState('HALF_OPEN')
        } else {
          throw new Error(
            'CIRCUIT_OPEN: Checkout temporarily unavailable. Using safe mode.',
          )
        }
      }

      try {
        const result = await action()
        // Success closes the circuit
        openedAt.current = null
        setFailures(0)
        setState('CLOSED')
        return result
      } catch (err) {
        setFailures((prev) => {
          const next = prev + 1
          if (next >= failureThreshold || state === 'HALF_OPEN') {
            openedAt.current = Date.now()
            setState('OPEN')
          }
          return next
        })
        throw err
      }
    },
    [state, failureThreshold, resetTimeoutMs],
  )

  return { state, failures, execute, reset }
}
