export function ProductArt({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || 'N'
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-100">
      <svg
        viewBox="0 0 320 240"
        className="h-full w-full"
        role="img"
        aria-label={`${name} placeholder`}
      >
        <rect width="320" height="240" fill="#f1f5f9" />
        <rect x="24" y="24" width="272" height="192" rx="16" fill="#e2e8f0" />
        <circle cx="160" cy="108" r="36" fill="#e0e7ff" />
        <text
          x="160"
          y="116"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="28"
          fontWeight="600"
          fill="#4338ca"
        >
          {initial}
        </text>
      </svg>
    </div>
  )
}
