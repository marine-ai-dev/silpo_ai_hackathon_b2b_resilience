// ManualScheduleProvider — reads/writes the `powerSchedules` collection.
// This is what the UI's manual power-schedule entry form actually writes
// to and reads from. Once a manager enters a real schedule for an office,
// that record becomes the active source for that office (see
// src/power/index.js#resolveProvider), overriding DemoScheduleProvider.
//
// Validation lives here (setSchedule), not in the route handler, so it's
// unit-testable in isolation: start < end, both parseable dates, never
// silently produces NaN/Invalid Date.

import { PowerScheduleProvider } from './PowerScheduleProvider.js';
import { collections } from '../repositories/jsonStore.js';

export const DEFAULT_STALE_AFTER_MINUTES = 12 * 60; // 12h — manual entries go stale slower than a demo feed

export class ManualScheduleProviderError extends Error {}

function validateWindow(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!start || !end || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new ManualScheduleProviderError('start and end must be valid ISO datetimes');
  }
  if (startDate.getTime() >= endDate.getTime()) {
    throw new ManualScheduleProviderError('start must be before end');
  }
  return { startDate, endDate };
}

export class ManualScheduleProvider extends PowerScheduleProvider {
  async getSchedule(officeId) {
    const record = collections.powerSchedules.findOne((s) => s.officeId === officeId && s.source === 'MANUAL');
    if (!record) {
      return {
        officeId,
        currentStatus: 'unknown',
        nextOutage: null,
        source: 'MANUAL',
        confidence: 'low',
        lastUpdatedAt: null,
        staleAfterMinutes: DEFAULT_STALE_AFTER_MINUTES,
        sourceNote: 'No manual schedule has been entered for this office yet.'
      };
    }
    return {
      officeId,
      currentStatus: record.currentStatus || 'unknown',
      nextOutage: record.nextOutageStart && record.nextOutageEnd
        ? { start: record.nextOutageStart, end: record.nextOutageEnd }
        : null,
      source: 'MANUAL',
      confidence: 'high', // human-entered, treated as authoritative when present
      lastUpdatedAt: record.updatedAt,
      staleAfterMinutes: DEFAULT_STALE_AFTER_MINUTES,
      sourceNote: record.note || 'Manually entered by office manager.'
    };
  }

  /**
   * Validates and writes the manual schedule for an office. Throws
   * ManualScheduleProviderError on malformed input (start >= end, unparsable
   * dates) — never silently persists NaN/Invalid Date.
   */
  setSchedule(officeId, { start, end, note, currentStatus, setBy }) {
    const { startDate, endDate } = validateWindow(start, end);
    const now = new Date().toISOString();
    const existing = collections.powerSchedules.findOne((s) => s.officeId === officeId && s.source === 'MANUAL');
    const patch = {
      officeId,
      source: 'MANUAL',
      currentStatus: currentStatus || 'normal',
      nextOutageStart: startDate.toISOString(),
      nextOutageEnd: endDate.toISOString(),
      note: note || '',
      setBy: setBy || 'Офіс-менеджер',
      updatedAt: now
    };
    return existing
      ? collections.powerSchedules.update(existing.id, patch)
      : collections.powerSchedules.insert(patch);
  }

  clearSchedule(officeId) {
    const existing = collections.powerSchedules.findOne((s) => s.officeId === officeId && s.source === 'MANUAL');
    if (existing) collections.powerSchedules.remove(existing.id);
    return true;
  }
}
