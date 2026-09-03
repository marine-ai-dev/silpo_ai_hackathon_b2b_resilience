// MockSilpoMcpClient — implements the exact same async method surface as
// SilpoMcpClient (see SilpoClientInterface.js), backed by realistic
// fixture data (src/silpo/fixtures.js). Used whenever SILPO_MODE=mock
// (the default), so `npm install && npm start` works with no live
// authentication anywhere.

import {
  BRANCH_ID,
  COMPANY_ID,
  CATEGORIES_TREE,
  PRODUCTS,
  PROMOTIONS,
  DELIVERY_TYPES,
  TIME_SLOTS
} from './fixtures.js';

function toPublicProduct(p) {
  return {
    productId: p.id,
    externalProductId: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    price: p.price,
    oldPrice: p.oldPrice,
    onPromotion: p.onPromotion,
    inStock: p.inStock,
    stockQty: p.stockQty,
    unit: p.unit,
    companyId: p.companyId,
    branchId: p.branchId
  };
}

let mockCart = null; // in-memory single cart, mirrors "one cart per account"

export class MockSilpoMcpClient {
  constructor() {
    this.mode = 'mock';
  }

  async getMyShoppingCart() {
    return { exists: !!mockCart, shoppingCartId: mockCart?.id ?? null };
  }

  async createShoppingCart({ addressType, latitude, longitude, deliveryType, timeslot, branchId }) {
    if (mockCart) return { shoppingCartId: mockCart.id };
    mockCart = {
      id: 'mock-cart-' + Date.now(),
      addressType,
      latitude,
      longitude,
      deliveryType,
      timeslot,
      branchId: branchId ?? BRANCH_ID,
      products: [],
      validations: []
    };
    return { shoppingCartId: mockCart.id };
  }

  async getShoppingCartById({ shoppingCartId }) {
    if (!mockCart || mockCart.id !== shoppingCartId) {
      return { shoppingCartId, exists: false, products: [], calculation: { total: 0, totalAfterDiscounts: 0 }, validations: [{ level: 'error', message: 'Cart not found' }] };
    }
    const total = mockCart.products.reduce((s, p) => s + p.unitPrice * p.quantity, 0);
    return {
      shoppingCartId: mockCart.id,
      exists: true,
      deliveryType: mockCart.deliveryType,
      timeslot: mockCart.timeslot,
      branchId: mockCart.branchId,
      products: mockCart.products,
      calculation: { total, totalAfterDiscounts: total },
      validations: mockCart.validations
    };
  }

  async getAvailableDeliveryTypes({ latitude, longitude }) {
    return { deliveryTypes: DELIVERY_TYPES };
  }

  async getTimeSlots({ branchId, deliveryTypes, start, end, limit }) {
    return { slots: TIME_SLOTS };
  }

  async findAddress({ address }) {
    return {
      address,
      latitude: 50.4501,
      longitude: 30.5234,
      city: 'Київ',
      street: 'вул. Хрещатик',
      house: '1',
      district: 'Шевченківський'
    };
  }

  async getCategoriesTree() {
    return { categories: CATEGORIES_TREE };
  }

  async getProducts({ category, mustHavePromotion, fromPrice, toPrice, inStock, limit, offset }) {
    let items = PRODUCTS;
    if (category) items = items.filter((p) => p.category === category);
    if (mustHavePromotion) items = items.filter((p) => p.onPromotion);
    if (typeof fromPrice === 'number') items = items.filter((p) => p.price >= fromPrice);
    if (typeof toPrice === 'number') items = items.filter((p) => p.price <= toPrice);
    if (inStock) items = items.filter((p) => p.inStock);
    const start = offset ?? 0;
    const end = limit ? start + limit : undefined;
    return { products: items.slice(start, end).map(toPublicProduct), total: items.length };
  }

  async findProductsBatch({ products, limit }) {
    // `products` is a list of free-text search terms or exact article codes,
    // mirroring the real tool's up-to-30-terms-per-call contract.
    const results = {};
    for (const term of products) {
      const needle = String(term).toLowerCase();
      const matches = PRODUCTS.filter(
        (p) =>
          p.id === term ||
          p.name.toLowerCase().includes(needle) ||
          p.slug.toLowerCase().includes(needle) ||
          p.category.toLowerCase().includes(needle)
      );
      results[term] = matches.slice(0, limit ?? 10).map(toPublicProduct);
    }
    return { results };
  }

  async getPromotions() {
    return { promotions: PROMOTIONS };
  }

  async getReplacements({ productIds }) {
    // Naive: same-category products excluding the input, flagged as low risk.
    const out = {};
    for (const id of productIds) {
      const src = PRODUCTS.find((p) => p.id === id);
      if (!src) { out[id] = []; continue; }
      out[id] = PRODUCTS.filter((p) => p.category === src.category && p.id !== id).map(toPublicProduct);
    }
    return { replacements: out };
  }

  async addOrUpdateCartProducts({ shoppingCartId, products }) {
    if (!mockCart || mockCart.id !== shoppingCartId) {
      throw new Error(`MockSilpoMcpClient: no cart with id ${shoppingCartId}`);
    }
    for (const item of products) {
      const catalog = PRODUCTS.find((p) => p.id === item.productId);
      const existing = mockCart.products.find((p) => p.productId === item.productId);
      if (existing) {
        existing.quantity = item.quantity;
      } else {
        mockCart.products.push({
          productId: item.productId,
          companyId: item.companyId,
          branchId: item.branchId,
          quantity: item.quantity,
          unitPrice: catalog?.price ?? 0,
          name: catalog?.name ?? item.productId
        });
      }
    }
    mockCart.validations = [];
    return { ok: true };
  }

  async removeCartProducts({ shoppingCartId, products }) {
    if (!mockCart || mockCart.id !== shoppingCartId) {
      throw new Error(`MockSilpoMcpClient: no cart with id ${shoppingCartId}`);
    }
    const ids = new Set(products.map((p) => p.productId));
    mockCart.products = mockCart.products.filter((p) => !ids.has(p.productId));
    return { ok: true };
  }

  async updateShoppingCart({ shoppingCartId, deliveryType, timeslot, address, shipments, promoCode, bonusRequested }) {
    if (!mockCart || mockCart.id !== shoppingCartId) {
      throw new Error(`MockSilpoMcpClient: no cart with id ${shoppingCartId}`);
    }
    mockCart.deliveryType = deliveryType ?? mockCart.deliveryType;
    mockCart.timeslot = timeslot ?? mockCart.timeslot;
    mockCart.address = address ?? mockCart.address;
    mockCart.shipments = shipments ?? mockCart.shipments;
    return { ok: true };
  }
}

export const MOCK_BRANCH_ID = BRANCH_ID;
export const MOCK_COMPANY_ID = COMPANY_ID;
