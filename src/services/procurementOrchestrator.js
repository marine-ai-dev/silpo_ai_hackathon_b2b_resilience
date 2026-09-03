// procurementOrchestrator — owns the ProcurementRun state machine and is
// the ONLY place that sequences Demand -> Procurement -> BudgetPolicy and
// persists their outputs. Agents themselves never write to the store
// directly; they return plain data, and this orchestrator decides what to
// persist and when to transition state.
//
// State machine:
//   DRAFT -> FORECASTING -> SOURCING -> OPTIMIZING -> READY_FOR_APPROVAL
//          -> APPROVED -> CART_PREPARED
//   any state -> FAILED (on error)
//   READY_FOR_APPROVAL -> CANCELLED (on rejection)
//
// Approval and cart preparation are separate explicit actions (see
// src/routes/api.js and src/services/cartPreparationService.js) — this
// file only covers DRAFT..READY_FOR_APPROVAL.

import { collections } from '../repositories/jsonStore.js';
import { forecast as runDemandAgent } from '../agents/demandAgent.js';
import { buildProposal as runProcurementAgent } from '../agents/procurementAgent.js';
import { applyPolicy as runBudgetPolicyAgent } from '../agents/budgetPolicyAgent.js';
import { computeShortfalls, buildReadinessForecast, buildReadinessSupplyPlanItems } from '../agents/readinessAgent.js';

export const RUN_STATES = Object.freeze({
  DRAFT: 'DRAFT',
  FORECASTING: 'FORECASTING',
  SOURCING: 'SOURCING',
  OPTIMIZING: 'OPTIMIZING',
  READY_FOR_APPROVAL: 'READY_FOR_APPROVAL',
  APPROVED: 'APPROVED',
  CART_PREPARED: 'CART_PREPARED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
});

function transition(runId, status, extra = {}) {
  return collections.procurementRuns.update(runId, { status, updatedAt: new Date().toISOString(), ...extra });
}

/**
 * Runs the full Demand -> Procurement -> BudgetPolicy pipeline for one
 * office + week, creating (or reusing) a ProcurementRun and persisting a
 * DemandForecast and ProcurementProposal along the way.
 */
export async function runWeeklyProcurement({ officeId, weekOf, expectedAttendance, silpoGateway }) {
  const office = collections.offices.getById(officeId);
  if (!office) throw new Error(`Office not found: ${officeId}`);

  const supplyPlan = collections.recurringSupplyPlans.findOne((p) => p.officeId === officeId);
  if (!supplyPlan) throw new Error(`No RecurringSupplyPlan for office ${officeId}`);

  const officeBudget = collections.officeBudgets.findOne((b) => b.officeId === officeId);
  const procurementPolicy = collections.procurementPolicies.findOne((p) => p.officeId === officeId);
  if (!officeBudget || !procurementPolicy) {
    throw new Error(`Office ${officeId} is missing OfficeBudget or ProcurementPolicy setup`);
  }

  let run = collections.procurementRuns.insert({
    officeId,
    weekOf,
    status: RUN_STATES.DRAFT,
    expectedAttendance,
    demandForecastId: null,
    procurementProposalId: null,
    cartSyncRecordId: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    errorDetail: null
  });

  try {
    // ---- FORECASTING ----
    transition(run.id, RUN_STATES.FORECASTING);
    const consumptionHistory = collections.consumptionRecords.find((r) => r.officeId === officeId);
    const feedbackHistory = collections.supplyFeedback.find((f) => f.officeId === officeId);
    const demandForecast = runDemandAgent(office, supplyPlan, consumptionHistory, feedbackHistory, expectedAttendance, weekOf);
    const savedForecast = collections.demandForecasts.insert(demandForecast);
    transition(run.id, RUN_STATES.FORECASTING, { demandForecastId: savedForecast.id });

    // ---- SOURCING ----
    transition(run.id, RUN_STATES.SOURCING);
    const deliveryContext = await silpoGateway.resolveDeliveryContext(office);
    const draftProposal = await runProcurementAgent(office, savedForecast, silpoGateway, deliveryContext, supplyPlan);
    draftProposal.runId = run.id;
    draftProposal.proposalKind = 'weekly-restock';

    // ---- OPTIMIZING ----
    transition(run.id, RUN_STATES.OPTIMIZING);
    const finalProposal = await runBudgetPolicyAgent(draftProposal, officeBudget, procurementPolicy, silpoGateway, deliveryContext);
    finalProposal.deliveryContext = deliveryContext;
    const savedProposal = collections.procurementProposals.insert(finalProposal);

    // ---- READY_FOR_APPROVAL ----
    run = transition(run.id, RUN_STATES.READY_FOR_APPROVAL, { procurementProposalId: savedProposal.id });

    return { run, forecast: savedForecast, proposal: savedProposal };
  } catch (err) {
    transition(run.id, RUN_STATES.FAILED, { errorDetail: err.message });
    throw err;
  }
}

/**
 * Runs the readiness top-up pipeline for one office: computes shortfalls
 * for its ReadinessItems (a stock-gap calculation, NOT a consumption
 * forecast — see src/agents/readinessAgent.js), then reuses the SAME
 * ProcurementAgent.buildProposal / BudgetPolicyAgent.applyPolicy steps as
 * the weekly-restock pipeline, per this project's "don't add unnecessary
 * agents" principle (docs/b2b-mvp/AGENTS.md). Produces a ProcurementRun +
 * ProcurementProposal exactly like runWeeklyProcurement, distinguished only
 * by `proposalKind: 'readiness-topup'` so the UI can label it correctly,
 * and by `weekOf` carrying today's date (readiness checks aren't week-scoped
 * the way kitchen restocks are, but the shared schema needs some value).
 */
export async function runReadinessTopUp({ officeId, silpoGateway }) {
  const office = collections.offices.getById(officeId);
  if (!office) throw new Error(`Office not found: ${officeId}`);

  const officeBudget = collections.officeBudgets.findOne((b) => b.officeId === officeId);
  const procurementPolicy = collections.procurementPolicies.findOne((p) => p.officeId === officeId);
  if (!officeBudget || !procurementPolicy) {
    throw new Error(`Office ${officeId} is missing OfficeBudget or ProcurementPolicy setup`);
  }

  const weekOf = new Date().toISOString().slice(0, 10);

  let run = collections.procurementRuns.insert({
    officeId,
    weekOf,
    status: RUN_STATES.DRAFT,
    expectedAttendance: null,
    runKind: 'readiness-topup',
    demandForecastId: null,
    procurementProposalId: null,
    cartSyncRecordId: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    errorDetail: null
  });

  try {
    // ---- FORECASTING (stock-gap calculation, not a forecast) ----
    transition(run.id, RUN_STATES.FORECASTING);
    const readinessItems = collections.readinessItems.find((r) => r.officeId === officeId);
    const stockChecks = collections.readinessStockChecks.find((c) => c.officeId === officeId);
    const shortfalls = computeShortfalls(readinessItems, stockChecks);
    const readinessForecast = buildReadinessForecast(office, shortfalls, weekOf);
    const savedForecast = collections.demandForecasts.insert(readinessForecast);
    transition(run.id, RUN_STATES.FORECASTING, { demandForecastId: savedForecast.id });

    if (readinessForecast.items.length === 0) {
      // Nothing to procure — all readiness items are at/above target.
      const emptyProposal = {
        officeId,
        weekOf,
        status: 'pending_approval',
        proposalKind: 'readiness-topup',
        runId: run.id,
        items: [],
        sourceMode: silpoGateway.mode === 'live' ? 'live' : 'mock',
        totalEstimated: 0,
        budgetCheck: { withinBudget: true, weeklyBudget: officeBudget.weeklyBudgetUAH, notes: ['No shortfall — all readiness items are at or above their target stock level.'] },
        history: [{ at: new Date().toISOString(), actor: 'readinessAgent', action: 'no_shortfall', detail: 'All readiness items are at or above target; nothing to procure.' }]
      };
      const savedProposal = collections.procurementProposals.insert(emptyProposal);
      run = transition(run.id, RUN_STATES.READY_FOR_APPROVAL, { procurementProposalId: savedProposal.id });
      return { run, forecast: savedForecast, proposal: savedProposal };
    }

    // ---- SOURCING ----
    transition(run.id, RUN_STATES.SOURCING);
    const deliveryContext = await silpoGateway.resolveDeliveryContext(office);
    const readinessSupplyPlan = { officeId, items: buildReadinessSupplyPlanItems(readinessItems) };
    const draftProposal = await runProcurementAgent(office, savedForecast, silpoGateway, deliveryContext, readinessSupplyPlan);
    draftProposal.runId = run.id;
    draftProposal.proposalKind = 'readiness-topup';

    // ---- OPTIMIZING ----
    transition(run.id, RUN_STATES.OPTIMIZING);
    const finalProposal = await runBudgetPolicyAgent(draftProposal, officeBudget, procurementPolicy, silpoGateway, deliveryContext);
    finalProposal.deliveryContext = deliveryContext;
    finalProposal.proposalKind = 'readiness-topup';
    const savedProposal = collections.procurementProposals.insert(finalProposal);

    // ---- READY_FOR_APPROVAL ----
    run = transition(run.id, RUN_STATES.READY_FOR_APPROVAL, { procurementProposalId: savedProposal.id });

    return { run, forecast: savedForecast, proposal: savedProposal };
  } catch (err) {
    transition(run.id, RUN_STATES.FAILED, { errorDetail: err.message });
    throw err;
  }
}
