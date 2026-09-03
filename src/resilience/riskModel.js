// riskModel — pure, deterministic, unit-testable risk classification.
// NOT an LLM call: the risk level and recommendation reasoning are plain
// arithmetic/comparisons on power status, time-to-outage, readiness
// shortfall, and schedule staleness/confidence, so the UI can show WHY a
// level was chosen, not an opaque generated sentence.
//
// Risk levels: NORMAL | WATCH | PREPARE | HIGH | ACTIVE_BLACKOUT | UNKNOWN

export const RISK_LEVELS = Object.freeze({
  NORMAL: 'NORMAL',
  WATCH: 'WATCH',
  PREPARE: 'PREPARE',
  HIGH: 'HIGH',
  ACTIVE_BLACKOUT: 'ACTIVE_BLACKOUT',
  UNKNOWN: 'UNKNOWN'
});

export const KYIV_TIME_ZONE = 'Europe/Kyiv';

/** True if `now - lastUpdatedAt` (both as Date-parseable values) exceeds
 * staleAfterMinutes. A null/missing lastUpdatedAt is always considered
 * stale (never silently treated as fresh). */
export function isStale(lastUpdatedAt, staleAfterMinutes, now = new Date()) {
  if (!lastUpdatedAt) return true;
  const last = new Date(lastUpdatedAt).getTime();
  if (Number.isNaN(last)) return true;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const ageMinutes = (nowMs - last) / 60000;
  return ageMinutes > (Number(staleAfterMinutes) || 0);
}

/** Minutes from `now` until an ISO datetime; negative if in the past;
 * null if the outage/time is missing or unparsable. Timezone-safe: ISO
 * datetimes carry their own offset, and Date arithmetic is always UTC-based
 * under the hood, so no explicit timeZone conversion is needed here for the
 * numeric delta itself — Europe/Kyiv formatting only matters for DISPLAY
 * (see formatKyivTime below), not for this comparison. */
export function minutesUntil(isoDateTime, now = new Date()) {
  if (!isoDateTime) return null;
  const target = new Date(isoDateTime).getTime();
  if (Number.isNaN(target)) return null;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return (target - nowMs) / 60000;
}

/** Formats an ISO datetime in Europe/Kyiv wall-clock time, explicit
 * timeZone (never assumes server-local time). */
export function formatKyivTime(isoDateTime) {
  if (!isoDateTime) return null;
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: KYIV_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);
}

/**
 * Classifies risk from normalized inputs.
 * @param {object} input
 * @param {'normal'|'active_blackout'|'unknown'} input.currentStatus
 * @param {{start:string,end:string}|null} input.nextOutage
 * @param {number} input.totalShortfall - sum of readiness shortfalls (>= 0)
 * @param {boolean} input.scheduleStale
 * @param {'high'|'medium'|'low'} input.confidence
 * @param {Date} [input.now]
 * @returns {{level:string, reasons:string[], minutesToOutage:number|null}}
 */
export function classifyRisk({ currentStatus, nextOutage, totalShortfall, scheduleStale, confidence, now = new Date() }) {
  const reasons = [];
  const shortfall = Number(totalShortfall) || 0;
  const minutesToOutage = nextOutage?.start ? minutesUntil(nextOutage.start, now) : null;

  // Unknown power status entirely (no schedule data at all) trumps everything
  // except an already-active blackout, which is unambiguous regardless of
  // schedule confidence.
  if (currentStatus === 'active_blackout') {
    reasons.push('Power status is currently ACTIVE_BLACKOUT for this office.');
    if (shortfall > 0) reasons.push(`Emergency readiness shortfall of ${shortfall} units is not yet covered.`);
    if (scheduleStale) reasons.push('Schedule data is stale — status may have changed since last update.');
    return { level: RISK_LEVELS.ACTIVE_BLACKOUT, reasons, minutesToOutage };
  }

  if (currentStatus === 'unknown' || confidence === 'low') {
    reasons.push(currentStatus === 'unknown'
      ? 'Power status is unknown — no schedule data available for this office.'
      : 'Power schedule confidence is low.');
    if (shortfall > 0) reasons.push(`Emergency readiness shortfall of ${shortfall} units.`);
    return { level: RISK_LEVELS.UNKNOWN, reasons, minutesToOutage };
  }

  if (scheduleStale) {
    reasons.push('Power schedule data is stale (older than its staleness window) — treat with caution.');
  }

  const HOURS = (m) => m / 60;

  if (minutesToOutage != null && minutesToOutage >= 0) {
    if (HOURS(minutesToOutage) <= 6) {
      reasons.push(`Next outage starts in ${Math.round(HOURS(minutesToOutage) * 10) / 10}h — inside the 6h HIGH-risk window.`);
      if (shortfall > 0) reasons.push(`Emergency readiness shortfall of ${shortfall} units still needs covering before then.`);
      return { level: RISK_LEVELS.HIGH, reasons, minutesToOutage };
    }
    if (HOURS(minutesToOutage) <= 24) {
      reasons.push(`Next outage starts in ${Math.round(HOURS(minutesToOutage) * 10) / 10}h — inside the 24h PREPARE window.`);
      if (shortfall > 0) {
        reasons.push(`Emergency readiness shortfall of ${shortfall} units — procurement should be triggered now to arrive in time.`);
        return { level: RISK_LEVELS.PREPARE, reasons, minutesToOutage };
      }
      reasons.push('Readiness stock is already at or above target — no shortfall to cover.');
      return { level: RISK_LEVELS.WATCH, reasons, minutesToOutage };
    }
    reasons.push(`Next outage starts in ${Math.round(HOURS(minutesToOutage))}h — beyond the 24h planning window.`);
    if (shortfall > 0) {
      reasons.push(`Emergency readiness shortfall of ${shortfall} units — worth topping up ahead of time, no urgency yet.`);
      return { level: RISK_LEVELS.WATCH, reasons, minutesToOutage };
    }
    return { level: RISK_LEVELS.NORMAL, reasons, minutesToOutage };
  }

  // No known next outage.
  if (shortfall > 0) {
    reasons.push(`No scheduled outage on record, but emergency readiness shortfall of ${shortfall} units exists — worth a routine top-up.`);
    return { level: RISK_LEVELS.WATCH, reasons, minutesToOutage };
  }
  reasons.push('No scheduled outage on record and readiness stock is at or above target.');
  return { level: RISK_LEVELS.NORMAL, reasons, minutesToOutage };
}

/**
 * Recommended procurement deadline + delivery window: simple explainable
 * arithmetic on the outage window, not ML. Deadline = outage start minus a
 * lead-time buffer (default 4h, enough for the mock/live sourcing+cart flow
 * plus a same-day delivery slot). Delivery window = "before outage start"
 * when there's still time, otherwise "after outage end" (can't beat the
 * clock, so plan for right after power is back).
 */
export function recommendTiming({ nextOutage, now = new Date(), leadTimeHours = 4 }) {
  if (!nextOutage?.start || !nextOutage?.end) {
    return {
      procurementDeadline: null,
      deliveryWindow: null,
      rationale: 'No known outage window — no timing recommendation to compute.'
    };
  }
  const outageStart = new Date(nextOutage.start);
  const outageEnd = new Date(nextOutage.end);
  if (Number.isNaN(outageStart.getTime()) || Number.isNaN(outageEnd.getTime())) {
    return { procurementDeadline: null, deliveryWindow: null, rationale: 'Outage window contains an invalid date.' };
  }
  const minutesToStart = minutesUntil(nextOutage.start, now);
  const deadline = new Date(outageStart.getTime() - leadTimeHours * 60 * 60 * 1000);

  if (minutesToStart != null && minutesToStart > leadTimeHours * 60) {
    return {
      procurementDeadline: deadline.toISOString(),
      deliveryWindow: 'before_outage_start',
      rationale: `Outage starts ${formatKyivTime(nextOutage.start)} (Kyiv time). Recommending delivery to arrive before then, with a ${leadTimeHours}h buffer -> procurement deadline ${formatKyivTime(deadline.toISOString())} (Kyiv time).`
    };
  }
  return {
    procurementDeadline: outageEnd.toISOString(),
    deliveryWindow: 'after_outage_end',
    rationale: `Not enough lead time to deliver before outage start (${formatKyivTime(nextOutage.start)} Kyiv time) — recommending delivery after outage end (${formatKyivTime(nextOutage.end)} Kyiv time) instead.`
  };
}
