// DemandAgent — forecasts next week's quantity per productKey.
//
// Algorithm (deterministic, inspectable):
//   1. Baseline = trailing average weekly quantity per productKey over
//      available ConsumptionRecord history. Cold-start (no history) falls
//      back to a sane per-category default from the RecurringSupplyPlan.
//   2. Scale by attendance ratio = expectedAttendance / office.memberCount.
//   3. Apply the most recent SupplyFeedback signal per productKey:
//        NOT_ENOUGH -> +20% (capped, applied once)
//        TOO_MUCH   -> -20% (floored at a sane per-category minimum)
//        JUST_RIGHT -> no change
//   4. Round to a sensible unit quantity and record a human-readable
//      rationale per item explaining every adjustment applied.

const COLD_START_DEFAULTS = {
  water: 40, // liters/bottles per week baseline for an office
  coffee: 2, // kg or packs
  tea: 3,
  milk: 15, // liters
  snacks: 10,
  fruit: 12,
  paper: 6
};

const FEEDBACK_ADJUSTMENT = 0.2; // +/-20%
const MIN_QUANTITY = {
  water: 12, // never let water fall below this — essential category
  default: 1
};

function baselineFor(productKey, category, history) {
  const records = history.filter((r) => r.productKey === productKey);
  if (records.length === 0) {
    return COLD_START_DEFAULTS[category] ?? COLD_START_DEFAULTS.default ?? 5;
  }
  const total = records.reduce((sum, r) => sum + r.quantity, 0);
  return total / records.length;
}

function mostRecentFeedback(productKey, feedbackHistory) {
  const matches = feedbackHistory
    .filter((f) => f.productKey === productKey)
    .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1)); // newest first
  return matches[0] ?? null;
}

/**
 * @param {object} office - Office record (memberCount used for attendance ratio).
 * @param {object} supplyPlan - RecurringSupplyPlan with `.items` [{productKey,label,category}].
 * @param {Array} consumptionHistory - ConsumptionRecord[] for this office.
 * @param {Array} feedbackHistory - SupplyFeedback[] for this office.
 * @param {number} expectedAttendance - headcount expected next week.
 * @returns {{officeId, weekOf, items, generatedAt, generatedBy}}
 */
export function forecast(office, supplyPlan, consumptionHistory, feedbackHistory, expectedAttendance, weekOf) {
  const safeExpectedAttendance = Number.isFinite(Number(expectedAttendance)) ? Number(expectedAttendance) : office.memberCount;
  expectedAttendance = safeExpectedAttendance;
  const attendanceRatio = office.memberCount > 0 ? expectedAttendance / office.memberCount : 1;

  const items = supplyPlan.items.map((planItem) => {
    const rationale = [];
    const baseline = baselineFor(planItem.productKey, planItem.category, consumptionHistory);
    rationale.push(
      consumptionHistory.some((r) => r.productKey === planItem.productKey)
        ? `Baseline ${round(baseline)} ${planItem.unit || 'units'}/week from trailing average of ${consumptionHistory.filter((r) => r.productKey === planItem.productKey).length} week(s) of history.`
        : `Cold-start: no consumption history yet, using category default of ${baseline} ${planItem.unit || 'units'}/week.`
    );

    let qty = baseline * attendanceRatio;
    if (Math.abs(attendanceRatio - 1) > 0.001) {
      rationale.push(
        `Scaled by expected attendance ${expectedAttendance}/${office.memberCount} (x${attendanceRatio.toFixed(2)}) -> ${round(qty)}.`
      );
    }

    const fb = mostRecentFeedback(planItem.productKey, feedbackHistory);
    if (fb) {
      if (fb.signal === 'NOT_ENOUGH') {
        const before = qty;
        qty = qty * (1 + FEEDBACK_ADJUSTMENT);
        rationale.push(
          `Feedback "NOT_ENOUGH" on ${fb.weekOf} -> +${FEEDBACK_ADJUSTMENT * 100}% (${round(before)} -> ${round(qty)}).`
        );
      } else if (fb.signal === 'TOO_MUCH') {
        const before = qty;
        const min = MIN_QUANTITY[planItem.category] ?? MIN_QUANTITY.default;
        qty = Math.max(qty * (1 - FEEDBACK_ADJUSTMENT), min);
        rationale.push(
          `Feedback "TOO_MUCH" on ${fb.weekOf} -> -${FEEDBACK_ADJUSTMENT * 100}% (${round(before)} -> ${round(qty)}${qty === min ? `, floored at essential minimum ${min}` : ''}).`
        );
      } else {
        rationale.push(`Feedback "JUST_RIGHT" on ${fb.weekOf} -> no adjustment.`);
      }
    } else {
      rationale.push('No recent feedback on record for this item.');
    }

    const forecastQty = Math.max(1, Math.round(qty));

    return {
      productKey: planItem.productKey,
      label: planItem.label,
      category: planItem.category,
      unit: planItem.unit || 'units',
      forecastQty,
      previousQty: Math.round(baseline),
      delta: forecastQty - Math.round(baseline),
      rationale: rationale.join(' ')
    };
  });

  return {
    officeId: office.id,
    weekOf,
    items,
    generatedAt: new Date().toISOString(),
    generatedBy: 'DemandAgent'
  };
}

function round(n) {
  return Math.round(n * 10) / 10;
}
