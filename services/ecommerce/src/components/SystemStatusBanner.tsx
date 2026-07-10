import { useEffect, useState } from 'react'
import { AlertTriangle, XCircle } from 'lucide-react'
import { useSystemLoad } from '../hooks/useSystemLoad'

/**
 * HT-306 — Top alert banner that appears when SLA reliability drops.
 * Yellow (warning) when reliability is between 98 and 99.5 with violations.
 * Red (critical) when reliability falls below 98%.
 */
export const SystemStatusBanner = () => {
  const { violations, slaReliability, currentRPS } = useSystemLoad()
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (violations > 0 && slaReliability < 99.5) {
      setVisible(true)
      setDismissed(false)
    } else {
      setVisible(false)
    }
  }, [violations, slaReliability])

  if (!visible || dismissed) return null

  const isCritical = slaReliability < 98

  return (
    <div
      className={`fixed top-16 left-0 right-0 z-50 flex items-center justify-between
                  px-6 py-2.5 transition-all duration-300 animate-slide-down
                  ${
                    isCritical
                      ? 'bg-red-600/95 text-white border-b border-red-500 shadow-lg shadow-red-950/20'
                      : 'bg-yellow-500/95 text-black border-b border-yellow-400 shadow-lg shadow-yellow-950/20'
                  }`}
      role="alert"
    >
      <div className="flex items-center gap-3">
        {isCritical ? (
          <XCircle className="w-5 h-5 shrink-0 animate-bounce" />
        ) : (
          <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse" />
        )}
        <span className="font-semibold text-sm">
          {isCritical
            ? `CRITICAL CONGESTION: SLA Reliability is ${slaReliability.toFixed(2)}% | Active Violations: ${violations}`
            : `HIGH WORKLOAD WARNING: System load is high (${currentRPS} RPS). Checking out may be sluggish.`}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-xs px-2 py-1 rounded bg-black/10 hover:bg-black/20 font-bold"
      >
        Dismiss
      </button>
    </div>
  )
}
