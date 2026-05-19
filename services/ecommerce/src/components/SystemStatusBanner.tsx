import { AlertTriangle, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSystemLoad } from '../hooks/useSystemLoad'

export const SystemStatusBanner = () => {
  const { violations, slaReliability, status, currentRPS } = useSystemLoad()
  const [prevViolations, setPrevViolations] = useState(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (violations > prevViolations + 5) setVisible(true)
    setPrevViolations(violations)
  }, [violations, prevViolations])

  useEffect(() => {
    if (status === 'IDLE' || status === 'FINISHED') {
      const timer = setTimeout(() => setVisible(false), 3000)
      return () => clearTimeout(timer)
    }
    if (status === 'SIMULATING' && currentRPS > 1500) {
      setVisible(true)
    }
  }, [status, currentRPS])

  if (!visible) return null

  const isCritical = slaReliability < 98

  return (
    <div
      className={`fixed top-16 left-0 right-0 z-50 flex items-center gap-3 px-6 py-3 animate-slide-down
        ${isCritical ? 'bg-red-600/95 text-white' : 'bg-yellow-500/95 text-black'}`}
    >
      {isCritical ? (
        <XCircle className="w-5 h-5 shrink-0" strokeWidth={1.5} />
      ) : (
        <AlertTriangle className="w-5 h-5 shrink-0" strokeWidth={1.5} />
      )}
      <p className="text-sm font-medium flex-1">
        {isCritical ? (
          <>
            Critical: SLA reliability at {slaReliability.toFixed(1)}% — checkout may be severely
            delayed. {violations} SLA violations recorded.
          </>
        ) : (
          <>
            System under stress ({currentRPS.toLocaleString()} RPS) — expect slower checkout and
            surge pricing.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="text-xs font-bold uppercase tracking-wider opacity-80 hover:opacity-100"
      >
        Dismiss
      </button>
    </div>
  )
}
