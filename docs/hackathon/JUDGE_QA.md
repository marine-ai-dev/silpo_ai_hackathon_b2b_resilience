# JUDGE_QA.md — anticipated questions, factual answers

Every answer here is checked against the actual implementation and the
audit/hardening docs it cites. If a judge asks something not covered here,
default to the same honesty pattern: say what's actually built, cite the
doc, and don't round up.

---

**Q: Why MCP specifically — why not just call a normal Silpo API?**

Silpo doesn't expose a normal public REST API to third parties — the MCP
server (`mcp.silpo.ua`) *is* the integration surface Silpo provides. We
audited it fully before building anything (40 tools, `docs/silpo-mcp-audit/`)
so we'd build only against what's actually there, not what we assumed
might be there.

**Q: Why not just use a normal API more broadly — what does MCP buy you?**

Standardized tool discovery and a documented capability surface we could
audit up front, plus OAuth 2.1 + Dynamic Client Registration that let our
app become its own authenticated client — independent of any dev-tool
session — rather than needing a custom integration per vendor.

**Q: Is the DTEK data live?**

No. **No documented and verifiable official public programmatic API for
outage schedules was found during our research.** DTEK's own outage
checker is a Cloudflare-protected web tool plus a Telegram/Viber bot, not
a published API. We looked (`docs/b2b-resilience/DTEK_RESEARCH.md`), found
only unofficial reverse-engineered community projects, and deliberately
did not build against those — depending on an undocumented private
endpoint and calling it "live" would violate the same honesty bar we hold
the whole project to. Power schedule data in this app is either
**manually entered** by an office manager (who reads it off DTEK's own
tools) or **demo-seeded** for presentation — always labeled as such, never
as live.

**Q: Does the AI predict power outages or attacks?**

No, and we're explicit about this. The system does not forecast attacks or
predict when an outage will happen. It classifies *known* outage
information (manually entered or demo-seeded) against stock levels and
computes a deterministic risk/timing recommendation. This is operational
planning on top of known data, not prediction.

**Q: Is the Silpo product/catalog data live?**

Yes, genuinely — when running in `SILPO_MODE=live`. Product search,
pricing, and delivery-branch resolution go through real Silpo MCP tool
calls (`silpo_find_products_batch`, `silpo_get_available_delivery_types`,
`silpo_get_time_slots`), authenticated via our own OAuth client. This was
independently verified live during our hardening pass — real products,
real prices, one item honestly excluded when the live catalog had no
match that run (see `docs/b2b-resilience/LIVE_MCP_VERIFICATION.md` for the
full record). **The judge demo itself may run in deterministic
`SILPO_MODE=mock`** for reliability — we say so explicitly rather than
letting a mock run pass as live.

**Q: Can the system place orders automatically?**

No, and it can't even if we wanted it to. The audited Silpo MCP has **no
checkout/payment/order-placement tool at all** — we confirmed this across
all 40 tools before building anything. The system can prepare a real Silpo
cart (add items, set delivery), but finishing checkout is a manual step a
human does in the Silpo app/site. This is a platform limitation we
designed around, not a safety feature we're choosing to omit.

**Q: Why is checkout human-controlled?**

Two reasons: it's the only option Silpo's MCP gives us (see above), and
independently, we'd want a human approval gate regardless — a business
shouldn't have an AI autonomously spending its budget. `cartPreparationService`
is the only code path that can write to a real Silpo cart, and it's
hard-gated in code (not just UI) on the proposal's status being
`'approved'` — verified by an automated test.

**Q: What happens if the Silpo MCP is unavailable?**

The app degrades safely rather than crashing or faking data. A connection
failure surfaces as a typed `SilpoNotConnectedError`; the mock-mode client
provides a deterministic fallback for demos; the resilience plan's
logistics section reports `unavailable` with a reason string instead of
silently omitting or guessing. This was explicitly tested.

**Q: How is branch rerouting verified — could it just be made up?**

The generator-branch snapshot comes from Silpo's own published page
(`silpo.ua/de-pracyuiemo-na-generatorax`, captured via browser since it's
Cloudflare-protected against plain scraping). We then ran a real
deterministic matching pass against a live `silpo_list_branches` fetch
(455 branches) and classified every entry: **19 EXACT, 2 HIGH_CONFIDENCE,
1 AMBIGUOUS, 0 UNMATCHED** in our seeded set. The rerouting logic only ever
acts on EXACT/HIGH_CONFIDENCE matches — an AMBIGUOUS match is reported to
the UI for transparency but never used to actually reroute delivery. This
is enforced in code and covered by tests, not just documented as a
promise.

**Q: What part is AI vs. deterministic rules?**

AI/agentic: `DemandAgent` (forecasting), `ProcurementAgent` (product
resolution), `BudgetPolicyAgent` (budget optimization) — these make real
decisions with explainable logic, but none of them call an LLM; "agent"
here means autonomous decision-making, not a chat model. Deterministic,
non-agent: the risk classification, timing math, stock-gap calculation,
and branch-matching confidence logic are plain arithmetic/comparisons —
intentionally *not* framed as a 4th/5th agent, and documented as such
(`docs/b2b-mvp/AGENTS.md`).

**Q: What's the business model?**

Not finalized as part of this hackathon build — the working system is a
procurement/resilience layer a business would run against their own Silpo
B2B relationship. Plausible directions (subscription per office, per-order
fee, or a Silpo-side integration) haven't been chosen and we won't
pretend otherwise.

**Q: What's the societal value?**

Businesses prepare stock and adjust delivery timing *before* a known
interruption instead of scrambling during one, while a human stays in
control of every real purchase, and battery use closes into Silpo's real
recycling program instead of being thrown away. We deliberately do not
quote "outages prevented," "businesses saved," or any CO2/environmental
number — none of that is something we can honestly measure from a
hackathon build.

**Q: Why would Silpo want this?**

It's a demand-generation layer that routes real B2B purchases through
Silpo's actual catalog and delivery infrastructure — including surfacing
their generator-branch resilience and battery-recycling program (both
real Silpo initiatives) as differentiated value to business customers,
rather than being invisible to them.

**Q: What happens to the local data if I restart the server?**

State is a local JSON file (`data/db.json`) — a deliberate hackathon-scale
choice, documented as such, not presented as production-grade persistence.
`npm run seed` resets to a clean, deterministic demo state at any time.
