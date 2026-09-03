// ProcurementAgent — resolves each DemandForecast item to a real Silpo
// product (via SilpoGateway.searchProducts, which calls
// silpo_find_products_batch under the hood — batched, one call for the
// whole forecast, per the audit's up-to-30-terms-per-call contract) and
// builds a draft ProcurementProposal with real prices/line totals.
//
// Resolution strategy per item:
//   1. Try the plan's targetProductQuery / label as a search term.
//   2. Prefer in-stock candidates; among those, the cheapest reasonable
//      match (naive heuristic — first in-stock result from the batch call,
//      which the fixture/live catalog already returns price-sorted-ish).
//   3. If nothing usable comes back, fall back to browsing the category via
//      SilpoGateway.searchByCategory.
//   4. Optionally consult getReplacements for the chosen product to note a
//      fulfilment-risk substitute (nice-to-have, best-effort — never blocks
//      the proposal).

function pickBestCandidate(candidates) {
  if (!candidates || candidates.length === 0) return null;
  const inStock = candidates.filter((c) => c.inStock);
  const pool = inStock.length ? inStock : candidates;
  return pool.slice().sort((a, b) => a.price - b.price)[0];
}

export async function buildProposal(office, forecast, silpoGateway, deliveryContext, supplyPlan) {
  const planByKey = new Map((supplyPlan.items || []).map((i) => [i.productKey, i]));
  const searchTerms = forecast.items.map(
    (item) => planByKey.get(item.productKey)?.targetProductQuery || item.label
  );

  const batchResults = await silpoGateway.searchProducts(searchTerms, deliveryContext);

  const items = [];
  const notes = [];

  for (let i = 0; i < forecast.items.length; i++) {
    const fItem = forecast.items[i];
    const planItem = planByKey.get(fItem.productKey);
    const term = searchTerms[i];
    let candidates = batchResults[term] || [];

    let source = 'ProcurementAgent';
    if (candidates.length === 0 && planItem?.silpoCategorySlug) {
      candidates = await silpoGateway.searchByCategory(planItem.silpoCategorySlug, deliveryContext);
      source = 'ProcurementAgent-category-fallback';
    }

    const chosen = pickBestCandidate(candidates);
    if (!chosen) {
      notes.push(`Could not resolve a Silpo product for "${fItem.label}" (search term "${term}"). Excluded from proposal.`);
      continue;
    }

    items.push({
      productKey: fItem.productKey,
      label: fItem.label,
      category: fItem.category,
      silpoProductId: chosen.productId,
      companyId: chosen.companyId,
      branchId: chosen.branchId,
      slug: chosen.slug,
      unitPrice: chosen.price,
      quantity: fItem.forecastQty,
      lineTotal: round2(chosen.price * fItem.forecastQty),
      onPromotion: !!chosen.onPromotion,
      previousQty: fItem.previousQty,
      delta: fItem.delta,
      reason: fItem.rationale,
      source,
      // Provenance: which Silpo client actually served this product —
      // "live" (real mcp.silpo.ua data, requires a connected OAuth token)
      // or "mock" (fixture data). Surfaced in the UI so nobody mistakes
      // fixture prices for real ones.
      dataSource: silpoGateway.mode === 'live' ? 'live' : 'mock'
    });
  }

  const totalEstimated = round2(items.reduce((s, it) => s + it.lineTotal, 0));

  return {
    officeId: office.id,
    weekOf: forecast.weekOf,
    status: 'draft',
    items,
    // Overall provenance flag for the proposal as a whole (all items are
    // sourced from the same SilpoGateway/mode within one run, so this is
    // just a convenience mirror of each item's dataSource).
    sourceMode: silpoGateway.mode === 'live' ? 'live' : 'mock',
    totalEstimated,
    budgetCheck: { withinBudget: null, weeklyBudget: null, notes: [] },
    history: [
      {
        at: new Date().toISOString(),
        actor: 'ProcurementAgent',
        action: 'built_draft',
        detail: `Resolved ${items.length}/${forecast.items.length} forecasted items to Silpo products. ${notes.join(' ')}`.trim()
      }
    ]
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
