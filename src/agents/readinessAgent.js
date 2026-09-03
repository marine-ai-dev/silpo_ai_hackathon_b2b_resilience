// readinessAgent — NOT a forecast. This is a straightforward stock-gap
// calculation for "Emergency Readiness" items (batteries, LED lighting,
// candles, extension cords, ...): readiness items are not consumed on a
// weekly schedule the way water/coffee/milk are, so DemandAgent's
// trailing-average forecasting math doesn't apply here. Instead, the model
// is: target stock level vs. most recently known current stock.
//
//   shortfall = max(0, targetQuantity - mostRecentKnownQuantity)
//
// If a ReadinessItem has never had a ReadinessStockCheck recorded, the
// current quantity is treated as 0 (worst case) — this prompts a full
// top-up, which is the safe default for an emergency-readiness item.

/**
 * @param {object} readinessItem - { id, officeId, label, category, unit, silpoCategorySlug, targetProductQuery, targetQuantity }
 * @param {Array} stockChecks - ReadinessStockCheck[] for this office (all items, will be filtered)
 * @returns {{ readinessItemId, label, targetQuantity, mostRecentKnownQuantity, lastCheckedAt, shortfall }}
 */
export function computeShortfall(readinessItem, stockChecks) {
  const checksForItem = (stockChecks || [])
    .filter((c) => c.readinessItemId === readinessItem.id)
    .sort((a, b) => (a.checkedAt < b.checkedAt ? 1 : -1)); // newest first

  const mostRecent = checksForItem[0] ?? null;
  const mostRecentKnownQuantity = mostRecent ? Number(mostRecent.currentQuantity) || 0 : 0;
  const targetQuantity = Number(readinessItem.targetQuantity) || 0;
  const shortfall = Math.max(0, targetQuantity - mostRecentKnownQuantity);

  return {
    readinessItemId: readinessItem.id,
    label: readinessItem.label,
    category: readinessItem.category || 'readiness',
    unit: readinessItem.unit || 'units',
    targetQuantity,
    mostRecentKnownQuantity,
    lastCheckedAt: mostRecent?.checkedAt ?? null,
    shortfall
  };
}

/**
 * Computes shortfalls for every ReadinessItem belonging to an office.
 * @param {Array} readinessItems - ReadinessItem[] for this office
 * @param {Array} stockChecks - ReadinessStockCheck[] for this office
 */
export function computeShortfalls(readinessItems, stockChecks) {
  return (readinessItems || []).map((item) => computeShortfall(item, stockChecks));
}

/**
 * Shapes the shortfalls into a DemandForecast-like object so the existing
 * ProcurementAgent.buildProposal()/BudgetPolicyAgent.applyPolicy() pipeline
 * can be reused as-is for readiness top-ups — the only thing that differs
 * from the weekly-restock path is how forecastQty is computed (stock-gap,
 * not a consumption forecast). Only items with a positive shortfall are
 * included, since a fully-stocked item needs no procurement line.
 */
export function buildReadinessForecast(office, shortfalls, weekOf) {
  const items = shortfalls
    .filter((s) => s.shortfall > 0)
    .map((s) => ({
      productKey: s.readinessItemId,
      label: s.label,
      category: s.category,
      unit: s.unit,
      forecastQty: s.shortfall,
      previousQty: s.mostRecentKnownQuantity,
      delta: s.shortfall,
      rationale: s.lastCheckedAt
        ? `Target stock ${s.targetQuantity} ${s.unit}, most recent stock check (${s.lastCheckedAt}) recorded ${s.mostRecentKnownQuantity} ${s.unit} on hand -> shortfall ${s.shortfall} ${s.unit}. Stock-gap calculation, not a consumption forecast.`
        : `Target stock ${s.targetQuantity} ${s.unit}, no stock check has ever been recorded -> treated as 0 on hand (worst case) -> full top-up of ${s.shortfall} ${s.unit} needed. Stock-gap calculation, not a consumption forecast.`
    }));

  return {
    officeId: office.id,
    weekOf,
    items,
    generatedAt: new Date().toISOString(),
    generatedBy: 'readinessAgent (stock-gap calculation, not a forecast)'
  };
}

/**
 * Shapes ReadinessItems into a RecurringSupplyPlan-like `.items` list so
 * ProcurementAgent.buildProposal() can resolve them to real Silpo products
 * via the same targetProductQuery/silpoCategorySlug resolution it already
 * uses for weekly-restock items.
 */
export function buildReadinessSupplyPlanItems(readinessItems) {
  return (readinessItems || []).map((it) => ({
    productKey: it.id,
    label: it.label,
    category: it.category || 'readiness',
    unit: it.unit,
    silpoCategorySlug: it.silpoCategorySlug || null,
    targetProductQuery: it.targetProductQuery || it.label
  }));
}
