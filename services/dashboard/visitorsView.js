// Pure view of GET /api/target/visitors (see services/orchestrator/visitors.go).
// These numbers are page loads by real browsers only. They are not the same
// thing as the "Total traffic (RPS)" series, which includes the replay Job,
// API calls and health checks.

export const VISITORS_REFRESH_MS = 5000;

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function minuteLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Returns null when the response is not usable, so the dashboard can show
// "unavailable" instead of a misleading zero.
export function mapVisitors(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.per_minute)) {
    return null;
  }
  const series = data.per_minute.map((row) => ({
    time: minuteLabel(row && row.t),
    pageviews: count(row && row.pageviews),
    newUnique: count(row && row.new_unique),
  }));
  const last15 = series.slice(-15);
  return {
    totalUnique: count(data.total_unique),
    totalPageviews: count(data.total_pageviews),
    series,
    lastHourPageviews: series.reduce((sum, row) => sum + row.pageviews, 0),
    last15Pageviews: last15.reduce((sum, row) => sum + row.pageviews, 0),
    since: typeof data.since === 'string' ? data.since : '',
  };
}

export function visitorsDetail(view) {
  if (!view) return 'Unavailable';
  const loads = view.totalPageviews === 1 ? 'page load' : 'page loads';
  return `${view.totalPageviews.toLocaleString()} ${loads} since the orchestrator started`;
}
