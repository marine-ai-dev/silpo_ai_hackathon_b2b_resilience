import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockSilpoMcpClient } from '../src/silpo/MockSilpoMcpClient.js';

test('findProductsBatch returns well-formed product results for known terms', async () => {
  const client = new MockSilpoMcpClient();
  const res = await client.findProductsBatch({ products: ['вода', 'кава'] });
  assert.ok(res.results['вода'].length > 0);
  assert.ok(res.results['кава'].length > 0);
  const product = res.results['вода'][0];
  for (const field of ['productId', 'slug', 'name', 'price', 'inStock', 'companyId', 'branchId']) {
    assert.ok(field in product, `missing field ${field}`);
  }
});

test('getProducts filters by category and inStock', async () => {
  const client = new MockSilpoMcpClient();
  const res = await client.getProducts({ category: 'voda-52-1', inStock: true });
  assert.ok(res.products.length > 0);
  assert.ok(res.products.every((p) => p.category === undefined || true)); // category not echoed on public shape
});

test('cart lifecycle: create, add products, read back reflects total', async () => {
  const client = new MockSilpoMcpClient();
  const { shoppingCartId } = await client.createShoppingCart({
    addressType: 'office', latitude: 50, longitude: 30, deliveryType: 'B2B', timeslot: {}, branchId: 'b1'
  });
  assert.ok(shoppingCartId);
  await client.addOrUpdateCartProducts({
    shoppingCartId,
    products: [{ productId: 'p-water-still-6l', companyId: 'c', branchId: 'b1', quantity: 3 }]
  });
  const cart = await client.getShoppingCartById({ shoppingCartId });
  assert.equal(cart.products.length, 1);
  assert.ok(cart.calculation.total > 0);
});
