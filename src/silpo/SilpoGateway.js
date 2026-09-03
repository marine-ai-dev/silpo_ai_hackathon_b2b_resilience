// SilpoGateway — the ONE seam between our procurement domain and the Silpo
// MCP client. Business logic (agents, services) should call these
// domain-oriented methods, never raw MCP tool names, so the mapping to
// Silpo's actual tool surface stays in one place.
//
// Wraps either SilpoMcpClient (live) or MockSilpoMcpClient (mock),
// selected by createSilpoClient() based on SILPO_MODE.

import { MockSilpoMcpClient, MOCK_BRANCH_ID, MOCK_COMPANY_ID } from './MockSilpoMcpClient.js';
import { SilpoMcpClient } from './SilpoMcpClient.js';
import { extractCity, applyBlackoutFailover } from './branchFailover.js';
import { collections } from '../repositories/jsonStore.js';

export function createSilpoClient() {
  const mode = (process.env.SILPO_MODE || 'mock').toLowerCase();
  if (mode === 'live') {
    console.log(`[Silpo] SILPO_MODE=live — connecting to ${process.env.SILPO_MCP_URL || 'https://mcp.silpo.ua/mcp'}`);
    return new SilpoMcpClient();
  }
  console.log('[Silpo] SILPO_MODE=mock (default) — using fixture data, no network calls.');
  return new MockSilpoMcpClient();
}

export class SilpoGateway {
  constructor(client = createSilpoClient()) {
    this.client = client;
  }

  get mode() {
    return this.client.mode;
  }

  // ---- Delivery / branch context ----

  async resolveDeliveryContext(office) {
    if (this.client.mode === 'mock') {
      const branchSelection = this._applyBlackoutFailover(office, MOCK_BRANCH_ID);
      return {
        branchId: branchSelection.branchId,
        companyId: MOCK_COMPANY_ID,
        deliveryType: 'B2B',
        latitude: office?.address?.lat ?? 50.4501,
        longitude: office?.address?.lon ?? 30.5234,
        timeslotStart: '2026-09-03T09:00:00+03:00',
        timeslotEnd: '2026-09-03T11:00:00+03:00',
        branchSelection
      };
    }
    // NOTE: field names below (`options[].deliveryType`/`.branchId`,
    // `slots[].start/end/available`) match the REAL silpo_get_available_delivery_types
    // / silpo_get_time_slots response shapes confirmed live in
    // docs/silpo-mcp-audit/00-live-validation-log.md — not a guessed shape.
    const addr = office?.address?.text
      ? await this.client.findAddress({ address: office.address.text })
      : null;
    const latitude = addr?.addresses?.[0]?.latitude ?? office?.address?.lat;
    const longitude = addr?.addresses?.[0]?.longitude ?? office?.address?.lon;

    const deliveryTypesRes = await this.client.getAvailableDeliveryTypes({ latitude, longitude });
    const options = deliveryTypesRes?.options ?? [];
    const b2b = options.find((d) => d.deliveryType === 'B2B') || options[0];

    const slots = await this.client.getTimeSlots({ branchId: b2b?.branchId });
    const slot = (slots?.slots ?? []).find((s) => s.available) || slots?.slots?.[0];

    const branchSelection = this._applyBlackoutFailover(office, b2b?.branchId);

    return {
      branchId: branchSelection.branchId,
      companyId: null, // resolved per-product from search/browse results, not from delivery-type discovery
      deliveryType: b2b?.deliveryType || 'DeliveryHome',
      latitude,
      longitude,
      timeslotStart: slot?.start,
      timeslotEnd: slot?.end,
      branchSelection
    };
  }

  // Blackout-aware branch failover — a SOFT preference, never a hard
  // dependency. Wrapped defensively so a bug or missing data here can never
  // break delivery-context resolution (see docs/b2b-mvp/ROADMAP.md and
  // src/silpo/branchFailover.js for the underlying pure logic + rationale).
  _applyBlackoutFailover(office, normalBranchId) {
    try {
      const normalCity = extractCity(office?.address?.text);
      const blackoutStatus = office?.id
        ? collections.regionalBlackoutStatuses.findOne((b) => b.officeId === office.id)
        : null;
      const generatorBranches = collections.generatorBranches.all();
      return applyBlackoutFailover({ normalBranchId, normalCity, blackoutStatus, generatorBranches });
    } catch (err) {
      console.error('[SilpoGateway] blackout failover check failed defensively, using normal branch selection', err);
      return {
        branchId: normalBranchId,
        usedFailover: false,
        reason: `Blackout failover check failed defensively (${err.message}) — using the normal branch selection.`
      };
    }
  }

  // ---- Catalog / search (used by ProcurementAgent) ----

  // Normalizes a product object into the {productId, companyId, branchId,
  // slug, price, inStock, onPromotion, name} shape the agents/UI consume.
  // Idempotent/defensive on purpose: it accepts BOTH the real live Silpo
  // field names (id, available, oldPrice/specialPrices, stock — confirmed
  // live in docs/silpo-mcp-audit/00-live-validation-log.md) AND
  // MockSilpoMcpClient's already-normalized fixture shape (productId,
  // inStock, onPromotion), so live and mock data flow through one mapping
  // without the mock needing to fake the raw wire format.
  _normalizeProduct(p) {
    if (!p) return null;
    const inStock =
      p.inStock !== undefined ? !!p.inStock : p.available !== undefined ? !!p.available : (p.stock ?? 0) > 0;
    const onPromotion = p.onPromotion !== undefined ? !!p.onPromotion : p.oldPrice != null || !!p.specialPrices;
    return {
      productId: p.productId ?? p.id,
      companyId: p.companyId,
      branchId: p.branchId,
      slug: p.slug,
      price: p.price,
      inStock,
      onPromotion,
      name: p.name
    };
  }

  async searchProducts(terms, deliveryContext) {
    const res = await this.client.findProductsBatch({
      branchId: deliveryContext.branchId,
      deliveryType: deliveryContext.deliveryType,
      timeslotStart: deliveryContext.timeslotStart,
      timeslotEnd: deliveryContext.timeslotEnd,
      products: terms,
      limit: 5
    });
    const byTerm = {};
    if (Array.isArray(res?.queries)) {
      // Real silpo_find_products_batch shape: { queries: [{ query, products }] }
      for (const q of res.queries) {
        byTerm[q.query] = (q.products ?? []).map((p) => this._normalizeProduct(p));
      }
    } else if (res?.results) {
      // MockSilpoMcpClient shape: { results: { [term]: [...] } }
      for (const [term, products] of Object.entries(res.results)) {
        byTerm[term] = (products ?? []).map((p) => this._normalizeProduct(p));
      }
    }
    return byTerm;
  }

  async searchByCategory(categorySlug, deliveryContext, extra = {}) {
    const res = await this.client.getProducts({
      branchId: deliveryContext.branchId,
      deliveryType: deliveryContext.deliveryType,
      timeslotStart: deliveryContext.timeslotStart,
      timeslotEnd: deliveryContext.timeslotEnd,
      category: categorySlug,
      inStock: true,
      ...extra
    });
    return (res?.products ?? []).map((p) => this._normalizeProduct(p));
  }

  async getPromotions(deliveryContext) {
    const res = await this.client.getPromotions({
      branchId: deliveryContext.branchId,
      deliveryType: deliveryContext.deliveryType,
      timeslotStart: deliveryContext.timeslotStart,
      timeslotEnd: deliveryContext.timeslotEnd
    });
    return res?.promotions ?? [];
  }

  async getReplacements(productIds, deliveryContext) {
    if (!productIds.length) return {};
    const res = await this.client.getReplacements({
      branchId: deliveryContext.branchId,
      companyId: deliveryContext.companyId,
      productIds,
      deliveryType: deliveryContext.deliveryType
    });
    return res?.replacements ?? {};
  }

  // ---- Cart (read side, safe anywhere) ----

  async getCurrentCart() {
    return this.client.getMyShoppingCart();
  }

  async getCart(shoppingCartId) {
    return this.client.getShoppingCartById({ shoppingCartId });
  }

  // ---- Cart writes: ONLY called by cartPreparationService, which itself
  // enforces the APPROVED-status gate before ever reaching this class. ----

  async getOrCreateCart(deliveryContext) {
    const existing = await this.client.getMyShoppingCart();
    if (existing?.exists && existing?.shoppingCartId) {
      return existing.shoppingCartId;
    }
    const created = await this.client.createShoppingCart({
      addressType: 'office',
      latitude: deliveryContext.latitude,
      longitude: deliveryContext.longitude,
      deliveryType: deliveryContext.deliveryType,
      timeslot: { start: deliveryContext.timeslotStart, end: deliveryContext.timeslotEnd },
      branchId: deliveryContext.branchId
    });
    return created.shoppingCartId;
  }

  async prepareCart(shoppingCartId, items) {
    // items: [{ silpoProductId, companyId, branchId, quantity }]
    await this.client.addOrUpdateCartProducts({
      shoppingCartId,
      products: items.map((it) => ({
        productId: it.silpoProductId,
        companyId: it.companyId,
        branchId: it.branchId,
        quantity: it.quantity
      }))
    });
    // Mandatory reread pattern documented in the audit: always re-fetch the
    // cart after a write to confirm no validation errors before trusting it.
    return this.client.getShoppingCartById({ shoppingCartId });
  }
}
