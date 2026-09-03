// Provider selection: SILPO_POWER_PROVIDER env var picks the default,
// but per-office, a MANUAL record (once entered via the UI) always takes
// priority over DEMO — "once a manager enters a real schedule, that becomes
// the active source, overriding demo" per spec. This is resolved per-office
// (not just per-process) since a demo office and a manually-configured
// office can coexist.

import { ManualScheduleProvider, ManualScheduleProviderError } from './ManualScheduleProvider.js';
import { DemoScheduleProvider } from './DemoScheduleProvider.js';
import { collections } from '../repositories/jsonStore.js';

export { ManualScheduleProvider, DemoScheduleProvider, ManualScheduleProviderError };

const manualProvider = new ManualScheduleProvider();
const demoProvider = new DemoScheduleProvider();

/**
 * Resolves the effective power schedule for an office: a MANUAL record, if
 * one has been entered, always wins; otherwise falls back to DEMO; if
 * neither exists, returns an honest 'unknown'/UNAVAILABLE shape. Never
 * throws — a provider error is caught and surfaced as an 'unknown' status
 * with source 'UNAVAILABLE' so the UI renders an honest UNAVAILABLE badge
 * instead of crashing (graceful degradation requirement).
 */
export async function getEffectivePowerSchedule(officeId) {
  try {
    const manualRecord = collections.powerSchedules.findOne((s) => s.officeId === officeId && s.source === 'MANUAL');
    if (manualRecord) {
      return await manualProvider.getSchedule(officeId);
    }
    const configuredDefault = (process.env.SILPO_POWER_PROVIDER || 'demo').toLowerCase();
    if (configuredDefault === 'manual') {
      return await manualProvider.getSchedule(officeId);
    }
    return await demoProvider.getSchedule(officeId);
  } catch (err) {
    return {
      officeId,
      currentStatus: 'unknown',
      nextOutage: null,
      source: 'UNAVAILABLE',
      confidence: 'low',
      lastUpdatedAt: null,
      staleAfterMinutes: 60,
      sourceNote: `Power schedule provider failed defensively (${err.message}) — treating as UNAVAILABLE.`,
      providerError: true
    };
  }
}

export function getManualScheduleProvider() {
  return manualProvider;
}

export function getDemoScheduleProvider() {
  return demoProvider;
}
