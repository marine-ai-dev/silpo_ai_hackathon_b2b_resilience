// cartPreparationService — the ONLY code path in this entire codebase
// allowed to call Silpo cart-WRITE tools (add/update cart products).
// It only ever runs against a ProcurementProposal whose status is
// 'approved' (and whose ProcurementRun is in APPROVED state) — this is
// gated in code below, not just by convention, per the hard constraint
// in the build spec.
//
// It NEVER calls, and must never be extended to call, anything resembling
// checkout / payment / order placement — no such Silpo MCP tool exists
// (confirmed by docs/silpo-mcp-audit/05-b2b-capability-matrix.md, row 25).
// The only Silpo write operations reachable from here are:
//   - get-or-create cart (silpo_create_shopping_cart)
//   - add/update cart products (silpo_add_or_update_cart_products)
//   - re-read cart (silpo_get_shopping_cart_by_id) — mandatory reread
//     pattern documented in the audit, to confirm no validation errors.

import { collections } from '../repositories/jsonStore.js';
import { RUN_STATES } from './procurementOrchestrator.js';

export async function prepareCartForProposal(proposalId, silpoGateway) {
  const proposal = collections.procurementProposals.getById(proposalId);
  if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);

  // --- Hard gate: only an approved proposal may ever reach a cart write. ---
  if (proposal.status !== 'approved') {
    throw new Error(
      `Refusing to prepare a Silpo cart: proposal ${proposalId} status is "${proposal.status}", must be "approved".`
    );
  }
  const run = proposal.runId ? collections.procurementRuns.getById(proposal.runId) : null;
  if (run && run.status !== RUN_STATES.APPROVED) {
    throw new Error(
      `Refusing to prepare a Silpo cart: run ${run.id} status is "${run.status}", must be "${RUN_STATES.APPROVED}".`
    );
  }
  // --- end hard gate ---

  const office = collections.offices.getById(proposal.officeId);
  const deliveryContext = proposal.deliveryContext || (await silpoGateway.resolveDeliveryContext(office));

  let cartSyncRecord;
  try {
    const shoppingCartId = await silpoGateway.getOrCreateCart(deliveryContext);

    // --- Cart safety: never clobber items already in the cart that aren't
    // part of this proposal. Read the cart BEFORE writing, diff its
    // products against this proposal's product ids, and only ever
    // add/update this proposal's own line items (silpo_add_or_update_cart_
    // products is additive/quantity-setting per product, never a
    // destructive replace — see docs/silpo-mcp-audit/02-tools-inventory.md
    // and 04-supported-workflows.md). We NEVER call silpo_clear_shopping_
    // cart from this service.
    const proposalProductIds = new Set(proposal.items.map((it) => it.silpoProductId));
    let preExistingUnrelatedCount = 0;
    try {
      const existingCart = await silpoGateway.getCart(shoppingCartId);
      const existingProducts = existingCart?.products || [];
      preExistingUnrelatedCount = existingProducts.filter((p) => !proposalProductIds.has(p.productId)).length;
    } catch (err) {
      // Non-fatal: if the pre-read fails we still proceed (additive write
      // is safe regardless), we just can't report the preserved count.
    }

    const cartSnapshot = await silpoGateway.prepareCart(
      shoppingCartId,
      proposal.items.map((it) => ({
        silpoProductId: it.silpoProductId,
        companyId: it.companyId,
        branchId: it.branchId,
        quantity: it.quantity
      }))
    );

    const hasErrors = (cartSnapshot?.validations || []).some((v) => v.level === 'error');
    const preservedNote = preExistingUnrelatedCount > 0
      ? `Left ${preExistingUnrelatedCount} pre-existing unrelated cart item(s) untouched.`
      : null;

    cartSyncRecord = collections.cartSyncRecords.insert({
      proposalId,
      runId: run?.id ?? null,
      officeId: proposal.officeId,
      weekOf: proposal.weekOf,
      silpoCartId: shoppingCartId,
      cartSnapshot,
      preExistingUnrelatedItemCount: preExistingUnrelatedCount,
      status: hasErrors ? 'failed' : 'prepared',
      preparedAt: new Date().toISOString(),
      errorDetail: hasErrors ? 'Cart re-read returned validation errors after write.' : null,
      note: preservedNote
    });

    collections.procurementProposals.update(proposalId, {
      status: 'prepared',
      history: [
        ...proposal.history,
        {
          at: cartSyncRecord.preparedAt,
          actor: 'cartPreparationService',
          action: hasErrors ? 'cart_prepare_failed' : 'cart_prepared',
          detail: `Silpo cart ${shoppingCartId} ${hasErrors ? 'has validation errors' : 'prepared successfully'}. Checkout/payment is a manual human step outside this system.${preservedNote ? ' ' + preservedNote : ''}`
        }
      ]
    });

    if (run) {
      collections.procurementRuns.update(run.id, {
        status: hasErrors ? RUN_STATES.FAILED : RUN_STATES.CART_PREPARED,
        cartSyncRecordId: cartSyncRecord.id,
        updatedAt: cartSyncRecord.preparedAt,
        errorDetail: hasErrors ? cartSyncRecord.errorDetail : null
      });
    }

    return cartSyncRecord;
  } catch (err) {
    cartSyncRecord = collections.cartSyncRecords.insert({
      proposalId,
      runId: run?.id ?? null,
      officeId: proposal.officeId,
      weekOf: proposal.weekOf,
      silpoCartId: null,
      cartSnapshot: null,
      status: 'failed',
      preparedAt: new Date().toISOString(),
      errorDetail: err.message
    });
    if (run) {
      collections.procurementRuns.update(run.id, {
        status: RUN_STATES.FAILED,
        cartSyncRecordId: cartSyncRecord.id,
        errorDetail: err.message,
        updatedAt: cartSyncRecord.preparedAt
      });
    }
    throw err;
  }
}
