# Silpo MCP Capability Audit

Deep technical audit of the connected `silpo` MCP server (`https://mcp.silpo.ua/mcp`), performed for the Silpo AI Hackathon B2B office-provisioning project. **No application code was written and no transactional action was taken** — this is discovery only.

Start here: [EXECUTIVE_SUMMARY.md](EXECUTIVE_SUMMARY.md)

## Contents

| File | Covers |
|---|---|
| [EXECUTIVE_SUMMARY.md](EXECUTIVE_SUMMARY.md) | One-page readable-alone summary |
| [00-live-validation-log.md](00-live-validation-log.md) | Every read-only call actually executed during this audit and what it proved |
| [01-server-capabilities.md](01-server-capabilities.md) | MCP primitives (tools/resources/prompts), auth characteristics, identifiers, constraints |
| [02-tools-inventory.md](02-tools-inventory.md) | All 40 tools, grouped by category, with risk/usefulness ratings |
| [03-domain-model.md](03-domain-model.md) | Reconstructed object graph (Mermaid) + entity presence checklist |
| [04-supported-workflows.md](04-supported-workflows.md) | End-to-end tool chains for every workflow the MCP actually supports |
| [05-b2b-capability-matrix.md](05-b2b-capability-matrix.md) | 36-item B2B capability classification (native / partial / build / impossible) |
| [06-agent-opportunities.md](06-agent-opportunities.md) | Candidate agents with real, non-artificial responsibilities |
| [07-gaps-and-limitations.md](07-gaps-and-limitations.md) | Native vs. ours-to-build vs. impossible, incl. explicit B2B/subscription/budget investigation |
| [08-hackathon-opportunities.md](08-hackathon-opportunities.md) | Top 15 MCP capabilities for the strongest demo |
| [tool-inventory.json](tool-inventory.json) | Machine-readable inventory, one entry per tool |

## Headline finding

Silpo's platform already exposes a delivery type literally named **`B2B`** ("B2B delivery (business orders)") through `silpo_get_available_delivery_types` — but **no company/tenant, employee, budget, approval, subscription, or checkout tool exists** anywhere in the 40-tool surface. The MCP is a strong, complete **pre-checkout grocery commerce toolkit** (catalog, cart, delivery, promotions, loyalty) for **one authenticated consumer account**; everything specific to "B2B office provisioning" — company identity, employees, budgets, approvals, recurrence, forecasting, and order placement itself — has to be built by us on top of it.

## Scope discipline followed in this audit

- No product/UI/MVP decisions were made.
- No cart mutation, order placement, bonus redemption, or account change was performed.
- Every claim in these documents is either backed by a tool schema or a logged live call (see [00-live-validation-log.md](00-live-validation-log.md)); inferred/uncertain points are labeled as such.
