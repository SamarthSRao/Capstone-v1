import { useEffect, useState } from 'react'
import { useSystemLoad } from '../hooks/useSystemLoad'

export const SystemStatusBanner = () => {
  const { violations, slaReliability, currentRPS } = useSystemLoad()
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const shouldShow = violations > 0 && slaReliability < 99.5

  useEffect(() => {
    if (shouldShow) {
      setVisible(true)
      setDismissed(false)
      return
    }

    if (!visible) return

    const timer = window.setTimeout(() => {
      setVisible(false)
    }, 3000)

    return () => window.clearTimeout(timer)
  }, [shouldShow, visible])

  if (!visible || dismissed) return null

  const isCritical = slaReliability < 98

  return (
    <div
      className={`fixed top-16 right-0 left-0 z-50 flex items-center justify-between gap-3 border-b px-6 py-2.5 text-sm animate-slide-down ${
        isCritical
          ? 'border-rose-200 bg-rose-50 text-rose-900'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
      role="alert"
    >
      <span className="font-medium">
        {isCritical
          ? `SLA reliability is ${slaReliability.toFixed(2)}%. Active violations: ${violations}.`
          : `Load is high (${currentRPS} RPS). Checkout may be slower.`}
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded-md px-2 py-1 text-xs font-medium underline"
      >
        Dismiss
      </button>
    </div>
  )
}
