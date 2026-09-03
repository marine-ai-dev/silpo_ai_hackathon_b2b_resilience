import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Point the JSON store at an isolated test DB file before importing anything
// that touches it, by temporarily swapping data/db.json — simplest safe way
// without adding a DI framework. We snapshot and restore the real file.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');
const BACKUP_FILE = DB_FILE + '.e2e-backup';

if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, BACKUP_FILE);

const { seed, SEED_CONSTANTS, nextWeekOf } = await import('../scripts/seed.js');
const { collections } = await import('../src/repositories/jsonStore.js');
const { SilpoGateway } = await import('../src/silpo/SilpoGateway.js');
const { MockSilpoMcpClient } = await import('../src/silpo/MockSilpoMcpClient.js');
const { runWeeklyProcurement, RUN_STATES } = await import('../src/services/procurementOrchestrator.js');
const { decide } = await import('../src/services/approvalService.js');
const { prepareCartForProposal } = await import('../src/services/cartPreparationService.js');

test.after(() => {
  if (fs.existsSync(BACKUP_FILE)) {
    fs.copyFileSync(BACKUP_FILE, DB_FILE);
    fs.unlinkSync(BACKUP_FILE);
  }
});

seed();
const gateway = new SilpoGateway(new MockSilpoMcpClient());

test('end-to-end: run pipeline reaches READY_FOR_APPROVAL with a real proposal', async () => {
  const { run, forecast, proposal } = await runWeeklyProcurement({
    officeId: SEED_CONSTANTS.OFFICE_ID,
    weekOf: nextWeekOf(),
    expectedAttendance: SEED_CONSTANTS.NEXT_WEEK_EXPECTED_ATTENDANCE,
    silpoGateway: gateway
  });
  assert.equal(run.status, RUN_STATES.READY_FOR_APPROVAL);
  assert.ok(forecast.items.length > 0);
  assert.equal(proposal.status, 'pending_approval');
  assert.ok(proposal.items.length > 0);

  // Water had NOT_ENOUGH feedback seeded twice -> forecast should recommend
  // an increase relative to trailing baseline.
  const water = forecast.items.find((i) => i.productKey === 'water');
  assert.ok(water.delta > 0, `expected water delta > 0, got ${water.delta}`);

  // Snacks had TOO_MUCH feedback seeded -> forecast should recommend a decrease.
  const snacks = forecast.items.find((i) => i.productKey === 'snacks');
  assert.ok(snacks.delta < 0, `expected snacks delta < 0, got ${snacks.delta}`);
});

test('cart preparation is blocked before approval (gate enforced)', async () => {
  const { proposal } = await runWeeklyProcurement({
    officeId: SEED_CONSTANTS.OFFICE_ID,
    weekOf: nextWeekOf(),
    expectedAttendance: 20,
    silpoGateway: gateway
  });
  await assert.rejects(() => prepareCartForProposal(proposal.id, gateway), /must be "approved"/);
});

test('approval flips proposal + run status, then cart preparation succeeds', async () => {
  const { run, proposal } = await runWeeklyProcurement({
    officeId: SEED_CONSTANTS.OFFICE_ID,
    weekOf: nextWeekOf(),
    expectedAttendance: 25,
    silpoGateway: gateway
  });

  const { proposal: approved } = decide({
    proposalId: proposal.id,
    approverName: 'Test Approver',
    decision: 'approved',
    comment: 'looks good'
  });
  assert.equal(approved.status, 'approved');
  const updatedRun = collections.procurementRuns.getById(run.id);
  assert.equal(updatedRun.status, RUN_STATES.APPROVED);

  const cartSync = await prepareCartForProposal(approved.id, gateway);
  assert.equal(cartSync.status, 'prepared');
  assert.ok(cartSync.silpoCartId);

  const finalProposal = collections.procurementProposals.getById(approved.id);
  assert.equal(finalProposal.status, 'prepared');
  const finalRun = collections.procurementRuns.getById(run.id);
  assert.equal(finalRun.status, RUN_STATES.CART_PREPARED);
});

test('cart preparation preserves pre-existing unrelated cart items (never clears them)', async () => {
  const { run, proposal } = await runWeeklyProcurement({
    officeId: SEED_CONSTANTS.OFFICE_ID,
    weekOf: nextWeekOf(),
    expectedAttendance: 20,
    silpoGateway: gateway
  });

  const { proposal: approved } = decide({
    proposalId: proposal.id,
    approverName: 'Test Approver',
    decision: 'approved',
    comment: 'ok'
  });

  // Seed an unrelated product directly into the (shared, in-mock-memory)
  // Silpo cart before preparation runs, simulating a cart that already had
  // something in it from outside this proposal.
  const office = collections.offices.getById(approved.officeId);
  const deliveryContext = approved.deliveryContext || (await gateway.resolveDeliveryContext(office));
  const shoppingCartId = await gateway.getOrCreateCart(deliveryContext);
  const proposalProductIds = new Set(approved.items.map((it) => it.silpoProductId));
  const allFixtureIds = (await gateway.client.getProducts({})).products.map((p) => p.productId);
  const unrelatedProductId = allFixtureIds.find((id) => !proposalProductIds.has(id));
  assert.ok(unrelatedProductId, 'expected at least one fixture product not in this proposal');
  await gateway.client.addOrUpdateCartProducts({
    shoppingCartId,
    products: [{ productId: unrelatedProductId, companyId: 'unrelated-co', branchId: 'b1', quantity: 2 }]
  });

  const cartSync = await prepareCartForProposal(approved.id, gateway);
  assert.equal(cartSync.status, 'prepared');
  assert.equal(cartSync.preExistingUnrelatedItemCount, 1);
  assert.ok(/pre-existing unrelated cart item/.test(cartSync.note));

  const finalCart = await gateway.client.getShoppingCartById({ shoppingCartId });
  const unrelatedStillThere = finalCart.products.find((p) => p.productId === unrelatedProductId);
  assert.ok(unrelatedStillThere, 'unrelated pre-existing item must still be in the cart');
  assert.equal(unrelatedStillThere.quantity, 2);
});

test('rejection cancels the run and never allows cart preparation', async () => {
  const { proposal } = await runWeeklyProcurement({
    officeId: SEED_CONSTANTS.OFFICE_ID,
    weekOf: nextWeekOf(),
    expectedAttendance: 22,
    silpoGateway: gateway
  });
  const { proposal: rejected } = decide({
    proposalId: proposal.id,
    approverName: 'Test Approver',
    decision: 'rejected',
    comment: 'too expensive'
  });
  assert.equal(rejected.status, 'rejected');
  await assert.rejects(() => prepareCartForProposal(rejected.id, gateway), /must be "approved"/);
});

// ---- Battery recycling log (Silpo "Батарейки, здавайтеся!" eco program) ----
// No Silpo MCP call involved (pure internal tracking), so this is tested
// directly against the collection rather than through an agent/gateway.
test('recycling log: entries accumulate and total sums correctly', () => {
  const officeId = SEED_CONSTANTS.OFFICE_ID;
  const before = collections.recyclingLogEntries.find((e) => e.officeId === officeId);
  const beforeTotal = before.reduce((s, e) => s + e.quantity, 0);

  collections.recyclingLogEntries.insert({
    officeId,
    quantity: 7,
    loggedBy: 'Test',
    loggedAt: new Date().toISOString(),
    note: 'unit test drop-off'
  });

  const after = collections.recyclingLogEntries.find((e) => e.officeId === officeId);
  const afterTotal = after.reduce((s, e) => s + e.quantity, 0);
  assert.equal(after.length, before.length + 1);
  assert.equal(afterTotal, beforeTotal + 7);
});
