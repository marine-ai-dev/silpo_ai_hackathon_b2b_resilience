// Documents the shared async interface implemented by both
// SilpoMcpClient (live, over MCP) and MockSilpoMcpClient (fixtures).
//
// Every method name maps 1:1 to the Silpo MCP tool of the same suffix
// (see docs/silpo-mcp-audit/tool-inventory.json — the canonical source of
// truth for tool names/params/response shapes). We only implement the
// subset actually needed for the demo flow, per the build spec.
//
// Cart-mutating methods (addOrUpdateCartProducts, removeCartProducts,
// updateShoppingCart) must ONLY ever be invoked from
// src/services/cartPreparationService.js, and only against an `approved`
// ProcurementProposal. See that file for the enforced gate.
//
// This file has no runtime behavior; it's documentation + a shape guard
// tests can import if useful.

export const SILPO_CLIENT_METHODS = [
  'getMyShoppingCart',
  'createShoppingCart',
  'getShoppingCartById',
  'getAvailableDeliveryTypes',
  'getTimeSlots',
  'findAddress',
  'getCategoriesTree',
  'getProducts',
  'findProductsBatch',
  'getPromotions',
  'getReplacements',
  'addOrUpdateCartProducts',
  'removeCartProducts',
  'updateShoppingCart'
];
