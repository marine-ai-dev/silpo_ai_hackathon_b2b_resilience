// DemoScheduleProvider — deterministic seeded data for demo scenarios.
// Deliberately NOT random and NOT wall-clock-dependent beyond "now" itself:
// given the same seeded `demoOutage` record and the same `now`, always
// returns the same classification. Used as the default fallback provider
// (SILPO_POWER_PROVIDER unset or 'demo') so the app works out of the box
// without any manual data entry. Honestly labeled 'DEMO' everywhere,
// never 'LIVE'.
//
// If no demo outage has been seeded for an office, returns 'unknown' /
// null nextOutage — this is the honest degrade-gracefully path for
// Scenario C (no special seeding, app still fully functional).

import { PowerScheduleProvider } from './PowerScheduleProvider.js';
import { collections } from '../repositories/jsonStore.js';

export const DEFAULT_STALE_AFTER_MINUTES = 6 * 60; // demo data staleness window (6h)

export class DemoScheduleProvider extends PowerScheduleProvider {
  async getSchedule(officeId) {
    const record = collections.powerSchedules.findOne((s) => s.officeId === officeId && s.source === 'DEMO');
    if (!record) {
      return {
        officeId,
        currentStatus: 'unknown',
        nextOutage: null,
        // Genuinely no data exists for this office — label it UNAVAILABLE,
        // not DEMO. Reporting 'DEMO' here would make the UI's source badge
        // (sourceBadge() in public/app.js) show "DEMO" for a state that is
        // actually "we have nothing," which is exactly the kind of
        // misleading provenance labeling this whole feature exists to avoid.
        source: 'UNAVAILABLE',
        confidence: 'low',
        lastUpdatedAt: null,
        staleAfterMinutes: DEFAULT_STALE_AFTER_MINUTES,
        sourceNote: 'No demo schedule seeded for this office — honest UNAVAILABLE state.'
      };
    }
    const now = Date.now();
    const outageStart = record.nextOutageStart ? new Date(record.nextOutageStart).getTime() : null;
    const outageEnd = record.nextOutageEnd ? new Date(record.nextOutageEnd).getTime() : null;
    const inActiveWindow = outageStart != null && outageEnd != null && now >= outageStart && now < outageEnd;

    return {
      officeId,
      currentStatus: inActiveWindow ? 'active_blackout' : (record.currentStatus || 'normal'),
      nextOutage: record.nextOutageStart && record.nextOutageEnd
        ? { start: record.nextOutageStart, end: record.nextOutageEnd }
        : null,
      source: 'DEMO',
      confidence: 'medium',
      lastUpdatedAt: record.updatedAt,
      staleAfterMinutes: DEFAULT_STALE_AFTER_MINUTES,
      sourceNote: record.note || 'Deterministic seeded demo schedule, not a live feed.'
    };
  }

  /** Seed helper used by scripts/seed.js — writes a DEMO-source record. */
  static seed(officeId, { start, end, currentStatus, note }) {
    const now = new Date().toISOString();
    const existing = collections.powerSchedules.findOne((s) => s.officeId === officeId && s.source === 'DEMO');
    const patch = {
      officeId,
      source: 'DEMO',
      currentStatus: currentStatus || 'normal',
      nextOutageStart: start || null,
      nextOutageEnd: end || null,
      note: note || '',
      updatedAt: now
    };
    return existing
      ? collections.powerSchedules.update(existing.id, patch)
      : collections.powerSchedules.insert(patch);
  }
}
