// PowerScheduleProvider — interface/contract for anything that can answer
// "what is the current/next power situation for this office?"
//
// ONLY two implementations exist in this codebase:
//   - ManualScheduleProvider: an office manager enters/edits the next known
//     outage window via the UI. Real operational data, human-entered.
//   - DemoScheduleProvider: deterministic seeded data for demo scenarios.
//
// There is deliberately NO DtekLiveProvider. See
// docs/b2b-resilience/DTEK_RESEARCH.md for why: no documented official
// public API for Ukrainian electricity outage schedules was found. DTEK's
// own outage checker is web-only and Cloudflare-protected; the only
// "APIs" found are unofficial, reverse-engineered, undocumented
// third-party projects, which this project's truthfulness rules forbid
// depending on or presenting as live/official. A real DtekLiveProvider
// COULD be added later by implementing this exact same interface — no
// consumer of PowerScheduleProvider would need to change — but it is out
// of scope now: a documented limitation, not a TODO buried in code.
//
// Normalized shape every provider must return from getSchedule(officeId):
//   {
//     officeId: string,
//     currentStatus: 'normal' | 'active_blackout' | 'unknown',
//     nextOutage: { start: ISOString, end: ISOString } | null,
//     source: 'MANUAL' | 'DEMO',
//     confidence: 'high' | 'medium' | 'low',
//     lastUpdatedAt: ISOString | null,
//     staleAfterMinutes: number,
//     sourceNote: string
//   }
//
// A schedule is "stale" if `now - lastUpdatedAt > staleAfterMinutes`.
// Staleness is a DERIVED property computed by the caller
// (src/resilience/riskModel.js#isStale) — providers just report
// lastUpdatedAt/staleAfterMinutes honestly; they never hide it, and they
// never label themselves "LIVE" or "OFFICIAL".

/**
 * @interface PowerScheduleProvider
 * @method {(officeId: string) => Promise<object>} getSchedule
 *
 * Implementations must NEVER throw for "no data configured" — that's a
 * valid, expected state (currentStatus: 'unknown', a low-confidence
 * record) returned as a normal value, not an exception. They MAY throw for
 * genuine infrastructure failure (a future live provider's network call
 * failing); callers must handle that defensively and degrade to
 * 'unknown' rather than crash.
 */
export class PowerScheduleProvider {
  // eslint-disable-next-line no-unused-vars
  async getSchedule(officeId) {
    throw new Error('PowerScheduleProvider.getSchedule() must be implemented by a subclass');
  }
}

export const POWER_SOURCE = Object.freeze({ MANUAL: 'MANUAL', DEMO: 'DEMO' });

export const POWER_STATUS = Object.freeze({
  NORMAL: 'normal',
  ACTIVE_BLACKOUT: 'active_blackout',
  UNKNOWN: 'unknown'
});
