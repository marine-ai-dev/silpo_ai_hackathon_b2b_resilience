// resiliencePlanner — composes ONE coherent resilience plan for an office
// from: power schedule (PowerScheduleProvider) + readiness shortfall
// (readinessAgent, reused as-is) + risk classification (riskModel, pure/
// deterministic) + delivery-branch context (SilpoGateway.resolveDeliveryContext
// / branchFailover, reused as-is) + recycling stats (reused as-is).
//
// This is a READ-MOSTLY planning view. It never triggers procurement or
// touches the Silpo cart — turning `recommendation` into a real proposal
// still goes through the existing runReadinessTopUp() -> approval ->
// cartPreparationService pipeline, unchanged. No new bypass path is added
// here.
//
// Not a 4th agent: this is a deterministic composition/service layer over
// the existing 3 LLM-free agents (DemandAgent/ProcurementAgent/
// BudgetPolicyAgent) plus the non-agent readinessAgent — see
// docs/b2b-mvp/AGENTS.md and docs/b2b-resilience/ARCHITECTURE.md.

import { collections } from '../repositories/jsonStore.js';
import { computeShortfalls } from '../agents/readinessAgent.js';
import { getEffectivePowerSchedule } from '../power/index.js';
import { classifyRisk, recommendTiming, isStale, formatKyivTime } from './riskModel.js';

/**
 * Builds the composed resilience plan for one office. Never throws for
 * expected degradation states (missing address, no schedule, no generator
 * match, provider failure) — those are all represented plainly inside the
 * returned object's `situation`/`provenance` sections. Only throws if the
 * office itself doesn't exist (a genuine 404-shaped caller error).
 */
export async function buildOfficeResiliencePlan(officeId, silpoGateway) {
  const office = collections.offices.getById(officeId);
  if (!office) throw new Error(`Office not found: ${officeId}`);

  const now = new Date();

  // ---- Power schedule ----
  const schedule = await getEffectivePowerSchedule(officeId);
  const scheduleStale = isStale(schedule.lastUpdatedAt, schedule.staleAfterMinutes, now);
  const scheduleUnavailable = schedule.currentStatus === 'unknown' && !schedule.nextOutage && !schedule.lastUpdatedAt;

  // ---- Regional blackout override (manual toggle — Feature 2 reuse) ----
  // RegionalBlackoutStatus.active=true is a concrete, human-confirmed "power
  // is out right now in our area" signal — distinct from (and more
  // immediate than) a scheduled future outage window from the power
  // schedule provider. When set, it overrides currentStatus for risk
  // classification purposes; nextOutage/timing data from the schedule are
  // still shown unmodified alongside it.
  let blackoutStatus = null;
  try {
    blackoutStatus = collections.regionalBlackoutStatuses.findOne((b) => b.officeId === officeId) || null;
  } catch {
    blackoutStatus = null;
  }
  const effectiveCurrentStatus = blackoutStatus?.active ? 'active_blackout' : schedule.currentStatus;

  // ---- Readiness shortfall (reused as-is) ----
  const readinessItems = collections.readinessItems.find((r) => r.officeId === officeId);
  const stockChecks = collections.readinessStockChecks.find((c) => c.officeId === officeId);
  const shortfalls = computeShortfalls(readinessItems, stockChecks);
  const totalShortfall = shortfalls.reduce((sum, s) => sum + (s.shortfall || 0), 0);

  // ---- Risk classification (pure, deterministic) ----
  const risk = classifyRisk({
    currentStatus: effectiveCurrentStatus,
    nextOutage: schedule.nextOutage,
    totalShortfall,
    scheduleStale,
    confidence: schedule.confidence,
    now
  });

  // ---- Timing recommendation ----
  const timing = recommendTiming({ nextOutage: schedule.nextOutage, now });

  // ---- Delivery-branch context (reused as-is; degrades gracefully) ----
  let logistics;
  try {
    const hasAddress = !!office?.address?.text;
    if (!hasAddress) {
      logistics = {
        branchId: null,
        usedFailover: false,
        reason: 'Office has no address on record — cannot resolve delivery branch context.',
        available: false
      };
    } else {
      const deliveryContext = await silpoGateway.resolveDeliveryContext(office);
      logistics = {
        branchId: deliveryContext.branchId,
        deliveryType: deliveryContext.deliveryType,
        timeslotStart: deliveryContext.timeslotStart,
        timeslotEnd: deliveryContext.timeslotEnd,
        branchSelection: deliveryContext.branchSelection,
        available: true
      };
    }
  } catch (err) {
    // Reuses the existing SilpoNotConnectedError / mock-mode fallback
    // pattern at the gateway layer — here we just make sure a Silpo/MCP
    // failure never breaks plan composition.
    logistics = {
      branchId: null,
      usedFailover: false,
      reason: `Delivery-branch resolution failed defensively (${err.message}).`,
      available: false
    };
  }

  // ---- ESG / recycling (reused as-is) ----
  const recyclingEntries = collections.recyclingLogEntries
    .find((e) => e.officeId === officeId)
    .sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1));
  const totalRecycled = recyclingEntries.reduce((sum, e) => sum + (e.quantity || 0), 0);

  // ---- Recommendation (plain-language, built from the same deterministic
  // reasons the risk model already computed — no LLM call) ----
  const recommendation = buildRecommendation({ risk, timing, totalShortfall, schedule });

  // ---- Demo metrics (deterministic only — see docs/b2b-resilience/DEMO_SCENARIOS.md
  // "Demo metrics" section for what was deliberately NOT computed and why,
  // e.g. no recycling "collection rate": that would need a tracked
  // "consumed" quantity, which this app does not record, so a % rate would
  // be a fabricated denominator, not a real one) ----
  const metrics = buildMetrics({ office, shortfalls, readinessItems, timing, now, logistics });

  return {
    officeId,
    generatedAt: now.toISOString(),
    situation: {
      office: { id: office.id, name: office.name, address: office.address?.text || null },
      power: {
        currentStatus: effectiveCurrentStatus,
        scheduleCurrentStatus: schedule.currentStatus,
        regionalBlackoutActive: !!blackoutStatus?.active,
        nextOutage: schedule.nextOutage,
        nextOutageKyiv: schedule.nextOutage
          ? { start: formatKyivTime(schedule.nextOutage.start), end: formatKyivTime(schedule.nextOutage.end) }
          : null,
        source: schedule.source,
        confidence: schedule.confidence,
        stale: scheduleStale,
        unavailable: scheduleUnavailable,
        lastUpdatedAt: schedule.lastUpdatedAt,
        sourceNote: schedule.sourceNote
      },
      readiness: {
        items: shortfalls,
        totalShortfall
      }
    },
    risk: {
      level: risk.level,
      reasons: risk.reasons,
      minutesToOutage: risk.minutesToOutage
    },
    recommendation,
    procurement: {
      // Read-mostly: this section never triggers a run. It only surfaces
      // what WOULD happen if the manager clicks through to the existing
      // readiness top-up flow.
      wouldRecommendTopUp: totalShortfall > 0,
      note: totalShortfall > 0
        ? `Triggering the existing readiness top-up (POST /offices/${officeId}/readiness-runs) would resolve real Silpo products for the ${shortfalls.filter((s) => s.shortfall > 0).length} shortfall item(s) via ProcurementAgent/BudgetPolicyAgent, same approval-gated pipeline as today.`
        : 'No shortfall — no procurement action recommended.'
    },
    timing,
    logistics,
    metrics,
    esg: {
      recyclingEntries,
      totalRecycled
    },
    provenance: {
      power: { source: schedule.source, confidence: schedule.confidence, lastUpdatedAt: schedule.lastUpdatedAt, stale: scheduleStale },
      regionalBlackoutStatus: blackoutStatus
        ? { active: blackoutStatus.active, setBy: blackoutStatus.setBy, setAt: blackoutStatus.setAt, source: 'MANUAL' }
        : { active: false, source: 'MANUAL', note: 'Never set for this office.' },
      readiness: { source: 'readinessAgent (stock-gap calculation)', lastCheckedAtByItem: Object.fromEntries(shortfalls.map((s) => [s.readinessItemId, s.lastCheckedAt])) },
      logistics: { source: logistics.available ? (silpoGateway.mode === 'live' ? 'silpo-mcp-live' : 'silpo-mcp-mock') : 'unavailable' },
      esg: { source: 'manual recycling log (recyclingLogEntries)' }
    }
  };
}

/**
 * Deterministic, defensible demo metrics only — every number here is
 * computed from real tracked data already in this plan. Deliberately does
 * NOT include a "recycling collection rate %": that would need a tracked
 * "batteries consumed" quantity, which this app never records (it only
 * tracks target/current stock and total recycled), so a rate would need an
 * invented denominator. See docs/b2b-resilience/DEMO_SCENARIOS.md.
 */
function buildMetrics({ office, shortfalls, readinessItems, timing, now, logistics }) {
  const totalTarget = readinessItems.reduce((sum, i) => sum + (Number(i.targetQuantity) || 0), 0);
  const shortfallByItemId = Object.fromEntries(shortfalls.map((s) => [s.readinessItemId, s]));
  const totalCovered = readinessItems.reduce((sum, i) => {
    const target = Number(i.targetQuantity) || 0;
    const shortfall = shortfallByItemId[i.id]?.shortfall ?? target;
    return sum + Math.max(0, target - shortfall);
  }, 0);
  const stockCoveragePercent = totalTarget > 0 ? Math.round((totalCovered / totalTarget) * 100) : null;
  const categoriesBelowTarget = shortfalls.filter((s) => s.shortfall > 0).length;
  const categoriesTotal = readinessItems.length;

  let procurementLeadTimeHours = null;
  if (timing.procurementDeadline) {
    const deadline = new Date(timing.procurementDeadline).getTime();
    if (!Number.isNaN(deadline)) {
      procurementLeadTimeHours = Math.round(((deadline - now.getTime()) / (60 * 60 * 1000)) * 10) / 10;
    }
  }

  // The lead-time buffer riskModel.recommendTiming() actually used (see its
  // own leadTimeHours default of 4h) — reported here as the "delivery
  // window shift," i.e. how many hours earlier than the outage start the
  // system is recommending delivery arrive.
  const deliveryWindowShiftHours = timing.deliveryWindow === 'before_outage_start' ? 4 : null;

  const generatorAlternativeFound = !!(logistics?.branchSelection?.generatorBranch);
  const generatorAlternativeUsed = !!(logistics?.branchSelection?.usedFailover);

  return {
    stockCoveragePercent,
    categoriesBelowTarget,
    categoriesTotal,
    procurementLeadTimeHours,
    deliveryWindowShiftHours,
    generatorAlternativeFound,
    generatorAlternativeUsed,
    note: 'All figures above are computed from real tracked data (readiness targets/stock checks, the timing recommendation\'s own arithmetic, and the generator-branch match on record) — no environmental-impact or national-scale statistics of any kind are estimated here.'
  };
}

function buildRecommendation({ risk, timing, totalShortfall, schedule }) {
  const lines = [];
  switch (risk.level) {
    case 'ACTIVE_BLACKOUT':
      lines.push('Office is currently in an active blackout (either the power schedule shows one in progress, or the regional blackout toggle has been manually marked active).');
      if (totalShortfall > 0) lines.push(`Emergency readiness stock still has a shortfall of ${totalShortfall} units — consider an immediate top-up once power/delivery conditions allow. This does NOT happen automatically; a manager must trigger it.`);
      else lines.push('Emergency readiness stock is fully covered.');
      break;
    case 'HIGH':
      lines.push('An outage is imminent (within 6 hours).');
      if (totalShortfall > 0) lines.push(`Start emergency procurement now — ${totalShortfall} units of shortfall need to arrive before the outage.`);
      break;
    case 'PREPARE':
      lines.push('An outage is expected within 24 hours.');
      lines.push(`Recommend triggering the readiness top-up soon to cover the ${totalShortfall}-unit shortfall in time.`);
      break;
    case 'WATCH':
      lines.push('No immediate outage risk, but worth keeping an eye on readiness stock.');
      if (totalShortfall > 0) lines.push(`There is a ${totalShortfall}-unit shortfall — a routine top-up would close it.`);
      break;
    case 'UNKNOWN':
      lines.push('Power status/schedule for this office is unknown or low-confidence.');
      lines.push(`Source: ${schedule.source}. ${schedule.sourceNote || ''}`.trim());
      break;
    default:
      lines.push('No outage risk detected and readiness stock is at or above target.');
  }
  if (timing.rationale) lines.push(timing.rationale);
  return { level: risk.level, summary: lines.join(' '), reasons: risk.reasons };
}
