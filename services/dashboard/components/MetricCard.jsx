export function MetricCard({ label, value, detail }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-console">
      <p className="text-[11px] font-medium uppercase tracking-wide text-console-label">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
      ) : null}
    </article>
  );
}
