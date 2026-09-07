import { Router } from 'express';
import { collections } from '../repositories/jsonStore.js';
import { runWeeklyProcurement, runReadinessTopUp } from '../services/procurementOrchestrator.js';
import { decide as decideApproval } from '../services/approvalService.js';
import { prepareCartForProposal } from '../services/cartPreparationService.js';
import { computeShortfalls } from '../agents/readinessAgent.js';
import { buildOfficeResiliencePlan } from '../resilience/resiliencePlanner.js';
import { getEffectivePowerSchedule, getManualScheduleProvider, ManualScheduleProviderError } from '../power/index.js';
import { explainProcurementRun } from '../services/explainService.js';

export function buildApiRouter(silpoGateway) {
  const router = Router();

  const ok = (res, data) => res.json(data);
  const fail = (res, err, code = 400) => {
    console.error('[API]', err);
    res.status(code).json({ error: err.message || String(err) });
  };

  // ---- Offices ----
  router.get('/offices', (req, res) => ok(res, collections.offices.all()));
  router.get('/offices/:id', (req, res) => {
    const office = collections.offices.getById(req.params.id);
    if (!office) return fail(res, new Error('Office not found'), 404);
    ok(res, office);
  });

  // ---- Recurring supply plans ----
  router.get('/offices/:id/supply-plan', (req, res) => {
    ok(res, collections.recurringSupplyPlans.findOne((p) => p.officeId === req.params.id));
  });

  // ---- Office profile edits (Demo Office Portal: employees / attendance) ----
  router.put('/offices/:id', (req, res) => {
    try {
      const existing = collections.offices.getById(req.params.id);
      if (!existing) return fail(res, new Error('Office not found'), 404);
      const { memberCount } = req.body;
      const patch = {};
      if (memberCount !== undefined) {
        const n = Number(memberCount);
        if (!Number.isFinite(n) || n <= 0) return fail(res, new Error('memberCount must be a positive number'), 400);
        patch.memberCount = n;
      }
      ok(res, collections.offices.update(req.params.id, patch));
    } catch (err) { fail(res, err); }
  });

  // ---- Budget & policy ----
  router.get('/offices/:id/budget', (req, res) => {
    ok(res, collections.officeBudgets.findOne((b) => b.officeId === req.params.id));
  });
  router.put('/offices/:id/budget', (req, res) => {
    try {
      const existing = collections.officeBudgets.findOne((b) => b.officeId === req.params.id);
      if (!existing) return fail(res, new Error('OfficeBudget not found'), 404);
      const { weeklyBudgetUAH } = req.body;
      const n = Number(weeklyBudgetUAH);
      if (!Number.isFinite(n) || n <= 0) return fail(res, new Error('weeklyBudgetUAH must be a positive number'), 400);
      ok(res, collections.officeBudgets.update(existing.id, { weeklyBudgetUAH: n }));
    } catch (err) { fail(res, err); }
  });
  router.get('/offices/:id/policy', (req, res) => {
    ok(res, collections.procurementPolicies.findOne((p) => p.officeId === req.params.id));
  });

  // ---- Consumption + feedback ----
  router.get('/offices/:id/consumption', (req, res) => {
    ok(res, collections.consumptionRecords.find((r) => r.officeId === req.params.id));
  });
  router.post('/offices/:id/consumption', (req, res) => {
    try {
      ok(res, collections.consumptionRecords.insert({ officeId: req.params.id, ...req.body }));
    } catch (err) { fail(res, err); }
  });

  router.get('/offices/:id/feedback', (req, res) => {
    ok(res, collections.supplyFeedback.find((f) => f.officeId === req.params.id));
  });
  router.post('/offices/:id/feedback', (req, res) => {
    try {
      ok(res, collections.supplyFeedback.insert({ officeId: req.params.id, ...req.body }));
    } catch (err) { fail(res, err); }
  });

  // ---- Pipeline: run the 3-agent orchestration for office+week ----
  router.post('/offices/:id/procurement-runs', async (req, res) => {
    try {
      const office = collections.offices.getById(req.params.id);
      if (!office) return fail(res, new Error('Office not found'), 404);
      const { weekOf } = req.body;
      const expectedAttendance = Number.isFinite(Number(req.body.expectedAttendance)) && req.body.expectedAttendance !== undefined && req.body.expectedAttendance !== null && req.body.expectedAttendance !== ''
        ? Number(req.body.expectedAttendance)
        : office.memberCount; // default: assume full expected headcount when the caller doesn't specify
      const result = await runWeeklyProcurement({
        officeId: req.params.id,
        weekOf,
        expectedAttendance,
        silpoGateway
      });
      ok(res, result);
    } catch (err) { fail(res, err, 500); }
  });

  router.get('/offices/:id/procurement-runs', (req, res) => {
    ok(res, collections.procurementRuns.find((r) => r.officeId === req.params.id).sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)));
  });

  router.get('/procurement-runs/:runId', (req, res) => {
    const run = collections.procurementRuns.getById(req.params.runId);
    if (!run) return fail(res, new Error('Run not found'), 404);
    const forecast = run.demandForecastId ? collections.demandForecasts.getById(run.demandForecastId) : null;
    const proposal = run.procurementProposalId ? collections.procurementProposals.getById(run.procurementProposalId) : null;
    const cartSyncRecord = run.cartSyncRecordId ? collections.cartSyncRecords.getById(run.cartSyncRecordId) : null;
    ok(res, { run, forecast, proposal, cartSyncRecord });
  });

  // ---- Proposals ----
  router.get('/proposals/:id', (req, res) => {
    const proposal = collections.procurementProposals.getById(req.params.id);
    if (!proposal) return fail(res, new Error('Proposal not found'), 404);
    ok(res, proposal);
  });

  // ---- Approval (workflow transition, not an agent) ----
  router.post('/proposals/:id/approval', (req, res) => {
    try {
      const { approverName, decision, comment } = req.body;
      const result = decideApproval({ proposalId: req.params.id, approverName, decision, comment });
      ok(res, result);
    } catch (err) { fail(res, err); }
  });

  // ---- Cart preparation (real Silpo write calls; gated on approved) ----
  router.post('/proposals/:id/prepare-cart', async (req, res) => {
    try {
      const cartSyncRecord = await prepareCartForProposal(req.params.id, silpoGateway);
      ok(res, cartSyncRecord);
    } catch (err) { fail(res, err, 409); }
  });

  // ---- History ----
  router.get('/offices/:id/cart-sync-records', (req, res) => {
    ok(res, collections.cartSyncRecords.find((r) => r.officeId === req.params.id).sort((a, b) => (a.preparedAt < b.preparedAt ? 1 : -1)));
  });

  router.get('/meta/silpo-mode', (req, res) => ok(res, { mode: silpoGateway.mode }));
  router.get('/meta/gemini-status', (req, res) => ok(res, { available: !!process.env.GEMINI_API_KEY }));

  // ---- Optional contextual explanation for a completed run (Gemini Flash
  // when GEMINI_API_KEY is set, deterministic template otherwise; never
  // recomputes quantities/budget — see explainService.js). ----
  router.get('/procurement-runs/:runId/explain', async (req, res) => {
    try {
      const run = collections.procurementRuns.getById(req.params.runId);
      if (!run) return fail(res, new Error('Run not found'), 404);
      const forecast = run.demandForecastId ? collections.demandForecasts.getById(run.demandForecastId) : null;
      const proposal = run.procurementProposalId ? collections.procurementProposals.getById(run.procurementProposalId) : null;
      const explanation = await explainProcurementRun({ forecast, proposal });
      ok(res, explanation);
    } catch (err) { fail(res, err, 500); }
  });

  // ---- Emergency Readiness (Feature 1) ----
  router.get('/offices/:id/readiness-items', (req, res) => {
    const items = collections.readinessItems.find((r) => r.officeId === req.params.id);
    const stockChecks = collections.readinessStockChecks.find((c) => c.officeId === req.params.id);
    const shortfalls = computeShortfalls(items, stockChecks);
    const byId = new Map(shortfalls.map((s) => [s.readinessItemId, s]));
    ok(res, items.map((it) => ({ ...it, shortfall: byId.get(it.id) })));
  });

  router.post('/offices/:id/readiness-items', (req, res) => {
    try {
      const { label, category, unit, silpoCategorySlug, targetProductQuery, targetQuantity } = req.body;
      ok(res, collections.readinessItems.insert({
        officeId: req.params.id,
        label,
        category: category || 'readiness',
        unit: unit || 'units',
        silpoCategorySlug: silpoCategorySlug || null,
        targetProductQuery: targetProductQuery || label,
        targetQuantity: Number(targetQuantity) || 0
      }));
    } catch (err) { fail(res, err); }
  });

  router.put('/readiness-items/:itemId', (req, res) => {
    try {
      const existing = collections.readinessItems.getById(req.params.itemId);
      if (!existing) return fail(res, new Error('Readiness item not found'), 404);
      const { label, category, unit, silpoCategorySlug, targetProductQuery, targetQuantity } = req.body;
      const patch = {};
      if (label !== undefined) patch.label = label;
      if (category !== undefined) patch.category = category;
      if (unit !== undefined) patch.unit = unit;
      if (silpoCategorySlug !== undefined) patch.silpoCategorySlug = silpoCategorySlug;
      if (targetProductQuery !== undefined) patch.targetProductQuery = targetProductQuery;
      if (targetQuantity !== undefined) patch.targetQuantity = Number(targetQuantity) || 0;
      ok(res, collections.readinessItems.update(req.params.itemId, patch));
    } catch (err) { fail(res, err); }
  });

  router.get('/offices/:id/readiness-stock-checks', (req, res) => {
    ok(res, collections.readinessStockChecks.find((c) => c.officeId === req.params.id).sort((a, b) => (a.checkedAt < b.checkedAt ? 1 : -1)));
  });

  router.post('/offices/:id/readiness-stock-checks', (req, res) => {
    try {
      const { readinessItemId, currentQuantity, note } = req.body;
      ok(res, collections.readinessStockChecks.insert({
        officeId: req.params.id,
        readinessItemId,
        currentQuantity: Number(currentQuantity) || 0,
        note: note || '',
        checkedAt: new Date().toISOString()
      }));
    } catch (err) { fail(res, err); }
  });

  // ---- Readiness top-up pipeline: reuses ProcurementAgent/BudgetPolicyAgent
  // via the same ProcurementRun/ProcurementProposal shapes as the weekly
  // restock pipeline, distinguished by proposalKind: 'readiness-topup'. ----
  router.post('/offices/:id/readiness-runs', async (req, res) => {
    try {
      const office = collections.offices.getById(req.params.id);
      if (!office) return fail(res, new Error('Office not found'), 404);
      const result = await runReadinessTopUp({ officeId: req.params.id, silpoGateway });
      ok(res, result);
    } catch (err) { fail(res, err, 500); }
  });

  // ---- Blackout-aware branch failover (Feature 2) ----
  // RegionalBlackoutStatus is a MANUAL toggle set by an office manager —
  // there is no live blackout-schedule API integration in this version.
  router.get('/offices/:id/blackout-status', (req, res) => {
    const status = collections.regionalBlackoutStatuses.findOne((b) => b.officeId === req.params.id);
    ok(res, status || { officeId: req.params.id, active: false, setBy: null, setAt: null, note: '' });
  });

  router.put('/offices/:id/blackout-status', (req, res) => {
    try {
      const { active, setBy, note } = req.body;
      const existing = collections.regionalBlackoutStatuses.findOne((b) => b.officeId === req.params.id);
      const patch = {
        officeId: req.params.id,
        active: !!active,
        setBy: setBy || 'Офіс-менеджер',
        setAt: new Date().toISOString(),
        note: note || ''
      };
      const result = existing
        ? collections.regionalBlackoutStatuses.update(existing.id, patch)
        : collections.regionalBlackoutStatuses.insert(patch);
      ok(res, result);
    } catch (err) { fail(res, err); }
  });

  router.get('/generator-branches', (req, res) => {
    ok(res, collections.generatorBranches.all());
  });

  // Preview which branch delivery would currently route through, and why —
  // a read-only call into the same resolveDeliveryContext() logic used by
  // the real pipeline, so the UI can show "using X because Y" without
  // triggering a full procurement run.
  router.get('/offices/:id/delivery-branch-preview', async (req, res) => {
    try {
      const office = collections.offices.getById(req.params.id);
      if (!office) return fail(res, new Error('Office not found'), 404);
      const deliveryContext = await silpoGateway.resolveDeliveryContext(office);
      ok(res, { branchId: deliveryContext.branchId, branchSelection: deliveryContext.branchSelection });
    } catch (err) { fail(res, err, 500); }
  });

  // ---- Battery recycling log (ESG tracking) ----
  // Ties into Silpo's REAL "Батарейки, здавайтеся!" (batareiky.ua) program —
  // 247 Silpo stores collect used batteries in-store (up to 50/visit),
  // partnered with a European recycling plant, with a dedicated phone
  // contact for large office collections (099-311-67-96, 097-168-55-76).
  // There is no API for this — it's a manual log the office manager enters
  // after dropping off batteries, same honesty pattern as the blackout
  // toggle: a real program, a manual entry point, not a fake live feed.
  router.get('/offices/:id/recycling-log', (req, res) => {
    const entries = collections.recyclingLogEntries
      .find((e) => e.officeId === req.params.id)
      .sort((a, b) => (a.loggedAt < b.loggedAt ? 1 : -1));
    const totalRecycled = entries.reduce((sum, e) => sum + (e.quantity || 0), 0);
    ok(res, { entries, totalRecycled });
  });

  router.post('/offices/:id/recycling-log', (req, res) => {
    try {
      const { quantity, loggedBy, note } = req.body;
      const qty = Number(quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        return fail(res, new Error('quantity must be a positive number'), 400);
      }
      const entry = collections.recyclingLogEntries.insert({
        officeId: req.params.id,
        quantity: qty,
        loggedBy: loggedBy || 'Офіс-менеджер',
        loggedAt: new Date().toISOString(),
        note: note || ''
      });
      ok(res, entry);
    } catch (err) { fail(res, err); }
  });

  // ---- Company theme (white-label branding) ----
  const DEFAULT_THEME = {
    id: 'default-theme',
    companyId: null,
    companyName: 'MarineAI',
    logoUrl: '',
    accentColor: '#7c5cff',
    accentColorSecondary: '#22d3ee',
    createdAt: null,
    updatedAt: null
  };

  router.get('/company-theme', (req, res) => {
    const all = collections.companyThemes.all();
    const theme = all[0];
    ok(res, theme || DEFAULT_THEME);
  });

  router.put('/company-theme', (req, res) => {
    try {
      const { companyName, logoUrl, accentColor, accentColorSecondary, companyId } = req.body;
      const existing = collections.companyThemes.all()[0];
      const now = new Date().toISOString();
      const patch = {
        companyId: companyId ?? existing?.companyId ?? null,
        companyName: companyName ?? existing?.companyName ?? DEFAULT_THEME.companyName,
        logoUrl: logoUrl ?? existing?.logoUrl ?? '',
        accentColor: accentColor ?? existing?.accentColor ?? DEFAULT_THEME.accentColor,
        accentColorSecondary: accentColorSecondary ?? existing?.accentColorSecondary ?? DEFAULT_THEME.accentColorSecondary,
        updatedAt: now
      };
      let result;
      if (existing) {
        result = collections.companyThemes.update(existing.id, patch);
      } else {
        result = collections.companyThemes.insert({ ...patch, createdAt: now });
      }
      ok(res, result);
    } catch (err) { fail(res, err); }
  });

  // ---- Resilience: composed office resilience plan (read-mostly; never
  // triggers procurement or touches the Silpo cart) ----
  router.get('/offices/:id/resilience-plan', async (req, res) => {
    try {
      const plan = await buildOfficeResiliencePlan(req.params.id, silpoGateway);
      ok(res, plan);
    } catch (err) { fail(res, err, err.message?.includes('not found') ? 404 : 500); }
  });

  // ---- Power schedule: GET reads the effective schedule (MANUAL if set,
  // else DEMO/UNAVAILABLE); PUT writes via ManualScheduleProvider, which
  // becomes the active source for this office once set. ----
  router.get('/offices/:id/power-schedule', async (req, res) => {
    try {
      const schedule = await getEffectivePowerSchedule(req.params.id);
      ok(res, schedule);
    } catch (err) { fail(res, err, 500); }
  });

  router.put('/offices/:id/power-schedule', (req, res) => {
    try {
      const { start, end, note, currentStatus, setBy } = req.body;
      const result = getManualScheduleProvider().setSchedule(req.params.id, { start, end, note, currentStatus, setBy });
      ok(res, result);
    } catch (err) {
      if (err instanceof ManualScheduleProviderError) return fail(res, err, 400);
      fail(res, err);
    }
  });

  return router;
}
