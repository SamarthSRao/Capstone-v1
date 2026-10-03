import { useSystemLoad } from '../hooks/useSystemLoad'

export function ChaosAlertPanel() {
  const { slaReliability, violations, currentRPS } = useSystemLoad()

  if (slaReliability >= 98) return null

  return (
    <div className="mx-auto max-w-6xl px-6 pt-4">
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-rose-900">Infrastructure under stress</p>
            <p className="mt-1 max-w-2xl text-sm text-rose-800">
              SLA reliability is {slaReliability.toFixed(2)}% with {violations} active
              violation{violations === 1 ? '' : 's'}. Checkout may be slower while capacity
              catches up. Current load: {currentRPS} RPS.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-rose-800">
            Degraded
          </span>
        </div>
      </div>
    </div>
  )
}
