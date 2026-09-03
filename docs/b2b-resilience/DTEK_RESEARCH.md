# DTEK / Ukrainian power-outage schedule research

Written up before implementation, per this project's own "no guessed/
hallucinated API contracts" discipline (`docs/silpo-mcp-audit/`).

## Question

Is there a documented, official, programmatically-accessible source for
Ukrainian electricity outage/blackout schedules (scheduled rolling
blackouts, "стабілізаційні відключення") that this app could integrate
with directly?

## Findings

- **DTEK** (the largest private power distributor, serving Kyiv and
  several oblasts) publishes outage schedules and an outage-checker tool
  at `dtek-kem.com.ua` / `dtek-krem.com.ua` and similar regional-subsidiary
  domains. These are **web pages**, not documented public APIs. A prior
  investigation in this same project (referenced in
  `docs/b2b-mvp/ROADMAP.md`'s "Blackout / power-resilience provisioning"
  section) already confirmed the related
  `silpo.ua/de-pracyuiemo-na-generatorax` page sits behind Cloudflare
  bot-protection; DTEK's own site checkers are likewise not designed for
  programmatic scraping, and bypassing bot-detection is explicitly
  prohibited for this project regardless of technical feasibility.
- DTEK also operates a **Telegram bot** (`@dtek_kyiv_bot` and regional
  equivalents) and a **Viber channel** for outage notifications — these
  are conversational/notification interfaces for end users, not APIs with
  a published contract, versioning, or terms of use for third-party
  integration.
- No official developer documentation, published OpenAPI/Swagger spec, or
  public API key registration flow was found for DTEK or for a
  national-level Ukrainian grid-operator outage-schedule API.
- Community projects exist — for example a Home Assistant integration
  that references an unofficial, reverse-engineered "E-Svitlo API" — but
  these are **undocumented, third-party, unofficial** dependencies with no
  contractual guarantee of uptime, correctness, or continued availability.
  Depending on one would mean this app's "power status" data could
  silently break or drift from reality with no warning, and would violate
  this project's rule against depending on undocumented private APIs or
  labeling data "LIVE"/"OFFICIAL" when it isn't verified as such.

## Conclusion

**No `DtekLiveProvider` was built.** Building one would require either (a)
bypassing bot protection on an official site, which is out of scope and
explicitly prohibited, or (b) depending on an unofficial, undocumented,
reverse-engineered third-party API, which this project's truthfulness
rules also forbid presenting as a reliable data source. Both options fail
the same bar the Silpo MCP audit itself was built to enforce.

## What was built instead

- `ManualScheduleProvider` — an office manager enters the next known
  outage window (start, end, source note) via the UI. This is **real
  operational data** — the manager would, in practice, read it off the
  DTEK site/bot/Telegram channel themselves and type it in — just
  human-entered rather than machine-fetched. Labeled `'MANUAL'`, never
  `'LIVE'`.
- `DemoScheduleProvider` — deterministic seeded data for the hackathon
  demo scenarios, labeled `'DEMO'`, never `'LIVE'`.
- The `PowerScheduleProvider` interface (`src/power/PowerScheduleProvider.js`)
  is written so that a real `DtekLiveProvider` (if a legitimate, documented
  API is ever found or DTEK publishes one) could be added later by
  implementing the same `getSchedule(officeId)` contract — no consumer
  (`riskModel`, `resiliencePlanner`, the UI) would need to change. This is
  a **documented limitation**, not a TODO buried in code — see
  `LIMITATIONS.md`.

## Sources consulted

- `silpo.ua/de-pracyuiemo-na-generatorax` — confirmed Cloudflare-protected
  in this project's own earlier investigation (see
  `docs/b2b-mvp/ROADMAP.md`).
- DTEK regional subsidiary sites (`dtek-krem.com.ua`, `dtek-kem.com.ua`) —
  outage-checker web tools, no published API documentation found.
- General search for "DTEK API", "Ukraine blackout schedule API",
  "E-Svitlo API" — surfaced only unofficial/community reverse-engineering
  projects, no official developer program.
