import assert from 'node:assert/strict';
import test from 'node:test';
import { mapVisitors, visitorsDetail } from './visitorsView.js';

const sample = {
  total_unique: 12,
  total_pageviews: 31,
  window_minutes: 60,
  since: '2026-10-14T14:00:00Z',
  per_minute: [
    { t: '2026-10-14T14:58:00Z', pageviews: 0, new_unique: 0 },
    { t: '2026-10-14T14:59:00Z', pageviews: 4, new_unique: 3 },
    { t: '2026-10-14T15:00:00Z', pageviews: 2, new_unique: 1 },
  ],
};

test('maps totals and the per-minute series', () => {
  const view = mapVisitors(sample);
  assert.equal(view.totalUnique, 12);
  assert.equal(view.totalPageviews, 31);
  assert.equal(view.series.length, 3);
  assert.deepEqual(
    view.series.map((row) => row.pageviews),
    [0, 4, 2],
  );
  assert.deepEqual(
    view.series.map((row) => row.newUnique),
    [0, 3, 1],
  );
  assert.equal(view.lastHourPageviews, 6);
  assert.equal(view.since, '2026-10-14T14:00:00Z');
});

test('unusable responses give null, not a zero', () => {
  assert.equal(mapVisitors(null), null);
  assert.equal(mapVisitors({}), null);
  assert.equal(mapVisitors({ total_unique: 3 }), null);
  assert.equal(mapVisitors('nope'), null);
});

test('bad numbers become zero', () => {
  const view = mapVisitors({
    total_unique: 'x',
    total_pageviews: -4,
    per_minute: [{ t: 'not a time', pageviews: null, new_unique: undefined }],
  });
  assert.equal(view.totalUnique, 0);
  assert.equal(view.totalPageviews, 0);
  assert.deepEqual(view.series, [{ time: '', pageviews: 0, newUnique: 0 }]);
});

test('detail text', () => {
  assert.equal(visitorsDetail(null), 'Unavailable');
  assert.match(visitorsDetail(mapVisitors(sample)), /^31 page loads since/);
  assert.match(
    visitorsDetail(mapVisitors({ ...sample, total_pageviews: 1 })),
    /^1 page load since/,
  );
});
