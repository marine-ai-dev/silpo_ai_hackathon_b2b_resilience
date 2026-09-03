import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyRisk, recommendTiming, isStale, minutesUntil, formatKyivTime, RISK_LEVELS } from '../src/resilience/riskModel.js';

const NOW = new Date('2026-09-03T10:00:00+03:00');

test('isStale: null lastUpdatedAt is always stale', () => {
  assert.equal(isStale(null, 60, NOW), true);
  assert.equal(isStale(undefined, 60, NOW), true);
});

test('isStale: fresh vs stale boundary', () => {
  const fresh = new Date(NOW.getTime() - 30 * 60000).toISOString();
  const stale = new Date(NOW.getTime() - 90 * 60000).toISOString();
  assert.equal(isStale(fresh, 60, NOW), false);
  assert.equal(isStale(stale, 60, NOW), true);
});

test('isStale: invalid date string treated as stale', () => {
  assert.equal(isStale('not-a-date', 60, NOW), true);
});

test('minutesUntil: null/invalid returns null, never NaN', () => {
  assert.equal(minutesUntil(null, NOW), null);
  assert.equal(minutesUntil('garbage', NOW), null);
});

test('minutesUntil: correct positive/negative deltas', () => {
  const future = new Date(NOW.getTime() + 120 * 60000).toISOString();
  const past = new Date(NOW.getTime() - 60 * 60000).toISOString();
  assert.equal(minutesUntil(future, NOW), 120);
  assert.equal(minutesUntil(past, NOW), -60);
});

test('formatKyivTime: explicit Europe/Kyiv timezone, not server-local', () => {
  // 2026-09-03T10:00:00+03:00 is Kyiv summer time (EEST, UTC+3 in Sept)
  const formatted = formatKyivTime('2026-09-03T10:00:00+03:00');
  assert.match(formatted, /10:00/);
});

test('formatKyivTime: UTC input correctly converted to Kyiv wall clock', () => {
  // 07:00 UTC == 10:00 Kyiv (UTC+3 in September, EEST still in effect)
  const formatted = formatKyivTime('2026-09-03T07:00:00Z');
  assert.match(formatted, /10:00/);
});

test('classifyRisk: ACTIVE_BLACKOUT trumps everything else', () => {
  const result = classifyRisk({
    currentStatus: 'active_blackout',
    nextOutage: null,
    totalShortfall: 0,
    scheduleStale: false,
    confidence: 'high',
    now: NOW
  });
  assert.equal(result.level, RISK_LEVELS.ACTIVE_BLACKOUT);
  assert.ok(result.reasons.length > 0);
});

test('classifyRisk: unknown status -> UNKNOWN', () => {
  const result = classifyRisk({
    currentStatus: 'unknown',
    nextOutage: null,
    totalShortfall: 0,
    scheduleStale: true,
    confidence: 'low',
    now: NOW
  });
  assert.equal(result.level, RISK_LEVELS.UNKNOWN);
});

test('classifyRisk: outage within 6h -> HIGH', () => {
  const nextOutage = { start: new Date(NOW.getTime() + 3 * 3600000).toISOString(), end: new Date(NOW.getTime() + 7 * 3600000).toISOString() };
  const result = classifyRisk({ currentStatus: 'normal', nextOutage, totalShortfall: 5, scheduleStale: false, confidence: 'high', now: NOW });
  assert.equal(result.level, RISK_LEVELS.HIGH);
});

test('classifyRisk: outage within 24h + shortfall -> PREPARE', () => {
  const nextOutage = { start: new Date(NOW.getTime() + 20 * 3600000).toISOString(), end: new Date(NOW.getTime() + 24 * 3600000).toISOString() };
  const result = classifyRisk({ currentStatus: 'normal', nextOutage, totalShortfall: 10, scheduleStale: false, confidence: 'high', now: NOW });
  assert.equal(result.level, RISK_LEVELS.PREPARE);
});

test('classifyRisk: outage within 24h, no shortfall -> WATCH', () => {
  const nextOutage = { start: new Date(NOW.getTime() + 20 * 3600000).toISOString(), end: new Date(NOW.getTime() + 24 * 3600000).toISOString() };
  const result = classifyRisk({ currentStatus: 'normal', nextOutage, totalShortfall: 0, scheduleStale: false, confidence: 'high', now: NOW });
  assert.equal(result.level, RISK_LEVELS.WATCH);
});

test('classifyRisk: outage beyond 24h, no shortfall -> NORMAL', () => {
  const nextOutage = { start: new Date(NOW.getTime() + 48 * 3600000).toISOString(), end: new Date(NOW.getTime() + 52 * 3600000).toISOString() };
  const result = classifyRisk({ currentStatus: 'normal', nextOutage, totalShortfall: 0, scheduleStale: false, confidence: 'high', now: NOW });
  assert.equal(result.level, RISK_LEVELS.NORMAL);
});

test('classifyRisk: no scheduled outage, shortfall exists -> WATCH', () => {
  const result = classifyRisk({ currentStatus: 'normal', nextOutage: null, totalShortfall: 3, scheduleStale: false, confidence: 'high', now: NOW });
  assert.equal(result.level, RISK_LEVELS.WATCH);
});

test('classifyRisk: no scheduled outage, no shortfall -> NORMAL', () => {
  const result = classifyRisk({ currentStatus: 'normal', nextOutage: null, totalShortfall: 0, scheduleStale: false, confidence: 'high', now: NOW });
  assert.equal(result.level, RISK_LEVELS.NORMAL);
  assert.equal(Number.isNaN(result.level), false);
});

test('classifyRisk: shortfall is never NaN/negative-propagated', () => {
  const result = classifyRisk({ currentStatus: 'normal', nextOutage: null, totalShortfall: undefined, scheduleStale: false, confidence: 'high', now: NOW });
  assert.equal(result.level, RISK_LEVELS.NORMAL);
});

test('recommendTiming: enough lead time -> before_outage_start', () => {
  const nextOutage = { start: new Date(NOW.getTime() + 20 * 3600000).toISOString(), end: new Date(NOW.getTime() + 24 * 3600000).toISOString() };
  const result = recommendTiming({ nextOutage, now: NOW, leadTimeHours: 4 });
  assert.equal(result.deliveryWindow, 'before_outage_start');
  assert.ok(result.procurementDeadline);
  assert.equal(Number.isNaN(new Date(result.procurementDeadline).getTime()), false);
});

test('recommendTiming: not enough lead time -> after_outage_end', () => {
  const nextOutage = { start: new Date(NOW.getTime() + 2 * 3600000).toISOString(), end: new Date(NOW.getTime() + 6 * 3600000).toISOString() };
  const result = recommendTiming({ nextOutage, now: NOW, leadTimeHours: 4 });
  assert.equal(result.deliveryWindow, 'after_outage_end');
});

test('recommendTiming: no outage -> null timing, no crash', () => {
  const result = recommendTiming({ nextOutage: null, now: NOW });
  assert.equal(result.procurementDeadline, null);
  assert.equal(result.deliveryWindow, null);
});

test('recommendTiming: malformed outage dates handled without NaN', () => {
  const result = recommendTiming({ nextOutage: { start: 'garbage', end: 'also-garbage' }, now: NOW });
  assert.equal(result.procurementDeadline, null);
  assert.equal(result.deliveryWindow, null);
});
