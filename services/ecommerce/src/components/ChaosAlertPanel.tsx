import { AlertOctagon } from 'lucide-react'
import { useSystemLoad } from '../hooks/useSystemLoad'

/**
 * HT-403 — Prominent chaos panel when SLA reliability falls below 98%.
 * Complements SystemStatusBanner with an in-page warning shoppers can't miss.
 */
export function ChaosAlertPanel() {
  const { slaReliability, violations, currentRPS } = useSystemLoad()

  if (slaReliability >= 98) return null

  return (
    <div className="mx-auto max-w-6xl px-6 pt-4">
      <div className="relative overflow-hidden border border-red-500/60 bg-red-950/40 px-5 py-4">
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-red-600/10" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertOctagon className="mt-0.5 h-6 w-6 shrink-0 text-red-400" />
            <div>
              <p className="font-[family-name:var(--font-display)] text-lg font-bold text-red-300">
                Infrastructure under stress
              </p>
              <p className="mt-1 max-w-2xl text-sm text-red-100/80">
                SLA reliability is {slaReliability.toFixed(2)}% with {violations}{' '}
                active violation{violations === 1 ? '' : 's'}. Checkout latency
                may spike while HybridTimeNet scales capacity. Current load:{' '}
                {currentRPS} RPS.
              </p>
            </div>
          </div>
          <span className="shrink-0 self-start rounded border border-red-400/50 bg-red-600/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-200">
            Chaos mode
          </span>
        </div>
      </div>
    </div>
  )
}
