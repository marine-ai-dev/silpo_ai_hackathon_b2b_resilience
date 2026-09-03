// BudgetPolicyAgent — enforces OfficeBudget + ProcurementPolicy against a
// draft ProcurementProposal, mutating it in place into a policy-compliant,
// `pending_approval`-ready proposal. Every adjustment is logged into
// proposal.history[] and proposal.budgetCheck.notes[] so a human approver
// can see exactly what the agent changed and why.
//
// Steps:
//   1. Strip any item whose category is banned.
//   2. Enforce maxPerCategoryUAH: trim quantity (not below 1) until the
//      category subtotal fits.
//   3. If totalEstimated still exceeds weeklyBudgetUAH:
//        a. Prefer swapping to promoted items for that category if a
//           promoted candidate is available and cheaper (uses
//           silpoGateway.getPromotions/getReplacements when supplied).
//        b. Otherwise proportionally trim quantities (never below 1 unit,
//           and never below a category's essential floor) until within
//           budget.
//   4. Sets status to 'pending_approval'.

const ESSENTIAL_MIN_QTY = { water: 12 };

export async function applyPolicy(proposal, officeBudget, procurementPolicy, silpoGateway, deliveryContext) {
  const history = [...proposal.history];
  const notes = [];
  let items = proposal.items.map((it) => ({ ...it }));

  // 1. Banned categories
  const banned = new Set(procurementPolicy.bannedCategorySlugs || []);
  if (banned.size) {
    const before = items.length;
    const removed = items.filter((it) => banned.has(it.category));
    items = items.filter((it) => !banned.has(it.category));
    if (removed.length) {
      const msg = `Removed ${before - items.length} item(s) in banned categories: ${removed.map((r) => r.label).join(', ')}.`;
      notes.push(msg);
      history.push(logEntry('BudgetPolicyAgent', 'strip_banned_category', msg));
    }
  }

  // 2. Per-category cap
  const maxPerCategory = procurementPolicy.maxPerCategoryUAH || {};
  for (const [category, cap] of Object.entries(maxPerCategory)) {
    const catItems = items.filter((it) => it.category === category);
    let subtotal = catItems.reduce((s, it) => s + it.lineTotal, 0);
    if (subtotal <= cap) continue;
    // Trim quantities proportionally within the category until at/under cap.
    for (const it of catItems) {
      if (subtotal <= cap) break;
      const floor = ESSENTIAL_MIN_QTY[it.category] ?? 1;
      while (it.quantity > floor && subtotal > cap) {
        subtotal -= it.unitPrice;
        it.quantity -= 1;
        it.lineTotal = round2(it.unitPrice * it.quantity);
      }
    }
    const msg = `Category "${category}" exceeded max ${cap} UAH — trimmed quantities to fit (new subtotal ${round2(subtotal)} UAH).`;
    notes.push(msg);
    history.push(logEntry('BudgetPolicyAgent', 'enforce_category_cap', msg));
  }

  // 3. Overall weekly budget
  let total = round2(items.reduce((s, it) => s + it.lineTotal, 0));
  const weeklyBudget = officeBudget.weeklyBudgetUAH;

  if (total > weeklyBudget && procurementPolicy.preferPromotions && silpoGateway) {
    // 3a. Try swapping non-promoted items for a cheaper promoted alternative
    // in the same category, sourced live via getReplacements/getPromotions.
    for (const it of items) {
      if (total <= weeklyBudget) break;
      if (it.onPromotion) continue;
      try {
        const promos = await silpoGateway.getPromotions(deliveryContext);
        const promoMatch = promos.find((p) => p.productId !== it.silpoProductId && p.discountTo < it.unitPrice);
        if (promoMatch) {
          const savingsPerUnit = it.unitPrice - promoMatch.discountTo;
          const before = it.lineTotal;
          it.unitPrice = promoMatch.discountTo;
          it.onPromotion = true;
          it.silpoProductId = promoMatch.productId;
          it.slug = promoMatch.slug;
          it.lineTotal = round2(it.unitPrice * it.quantity);
          it.source = 'BudgetPolicyAgent-adjusted';
          total = round2(total - before + it.lineTotal);
          const msg = `Swapped "${it.label}" to a promoted SKU, saving ${round2(savingsPerUnit * it.quantity)} UAH.`;
          notes.push(msg);
          history.push(logEntry('BudgetPolicyAgent', 'swap_to_promotion', msg));
        }
      } catch (err) {
        notes.push(`Promotion lookup failed for "${it.label}": ${err.message}`);
      }
    }
  }

  if (total > weeklyBudget) {
    // 3b. Proportional trim across non-essential items until within budget.
    const overBy = total - weeklyBudget;
    let trimmedValue = 0;
    // Sort by lineTotal descending so we trim the biggest contributors first.
    const trimmable = items
      .filter((it) => (ESSENTIAL_MIN_QTY[it.category] ?? 1) < it.quantity || it.quantity > 1)
      .sort((a, b) => b.lineTotal - a.lineTotal);

    for (const it of trimmable) {
      if (trimmedValue >= overBy) break;
      const floor = ESSENTIAL_MIN_QTY[it.category] ?? 1;
      while (it.quantity > floor && trimmedValue < overBy) {
        trimmedValue += it.unitPrice;
        it.quantity -= 1;
        it.lineTotal = round2(it.unitPrice * it.quantity);
        it.source = 'BudgetPolicyAgent-adjusted';
      }
    }
    total = round2(items.reduce((s, it) => s + it.lineTotal, 0));
    const msg = `Proportionally trimmed quantities to close a ${round2(overBy)} UAH gap vs. weekly budget ${weeklyBudget} UAH. New total ${total} UAH.`;
    notes.push(msg);
    history.push(logEntry('BudgetPolicyAgent', 'proportional_trim', msg));
  }

  const withinBudget = total <= weeklyBudget;
  if (!withinBudget) {
    notes.push(`Still ${round2(total - weeklyBudget)} UAH over budget after all automatic adjustments — needs manual review.`);
  }

  proposal.items = items;
  proposal.totalEstimated = total;
  proposal.budgetCheck = { withinBudget, weeklyBudget, notes };
  proposal.status = 'pending_approval';
  proposal.history = [
    ...history,
    logEntry('BudgetPolicyAgent', 'set_pending_approval', 'Policy pass complete; awaiting human approval.')
  ];
  return proposal;
}

function logEntry(actor, action, detail) {
  return { at: new Date().toISOString(), actor, action, detail };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
