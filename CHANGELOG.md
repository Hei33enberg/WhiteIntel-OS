# Changelog

## 0.7.2 — 2026-08-11

Descriptions, manifests and docs only — no behaviour change, no new tools (still 18).

- **Cyprus (DRCOR) is live, and the README says exactly how far it goes.** New source,
  loading since 2026-08-11, licensed CC BY 4.0 (attribution carried in the README).
  Scope is stated bluntly because it is easy to oversell: the Cypriot open data is the
  **nominal layer — directors, secretaries, trade-name owners — with no shareholders and
  no beneficial owners.** Every Cyprus edge measured is a `Directorship`; there is not one
  ownership edge. Cypriot companies therefore answer `trace_ownership_path` /
  `check_offshore_exposure` with `no_ownership_data`, which means "no ownership edges held",
  not "cleanly owned". No row count is frozen into the docs while the load is still running.
- **`lookup_by_identifier` documents a trap it already had.** Cyprus records surface a
  `cy-reg:` identifier, but the route hard-rejects that scheme with a 400 (verified against
  the live API). The description now says so and points to `search_entities juris='cy'`.
  The enum is unchanged — the fix belongs in the description, not the API.
- **`get_pulse` was wrong on three counts and is now measured.** It claimed `watchlist` was
  "currently uncited (source-url NULL for every row)" and "filtered OUT of the default feed".
  Measured: all 47,784 watchlist rows carry a source URL, and they do appear in the default
  feed. It also called them "PEP listings" when they are PEP (33,685) + criminal/wanted
  (9,584) + procurement debarment (4,515). And a fourth live kind, **`sanction`** (209 rows,
  all cited), was missing from the enum, so agents could not filter for it even though the
  API serves it. Added.
- **`search_entities` stops overpromising provenance.** It said "each hit is flagged with its
  source"; the per-hit `source` field only distinguishes resolved corpus from live-registry
  passthrough and never names the originating registry. Reworded, and it now points at
  `get_entity` / `get_dossier` for real per-record citations.
- **GLEIF ownership relations now have a nightly refresh scheduled** (the stream had been
  frozen since 2026-07-09). Stated as *scheduled*, not *verified*: the job is active, but
  the loader ledger records no completed GLEIF pass yet, so `source_freshness()` still
  reports the source as untracked. It will say otherwise once a pass lands.
- **Corpus counts corrected everywhere, including the two files the last pass missed.**
  0.7.1 claimed in its commit message to fix the count "everywhere it appears" but only
  touched the README and `index.js`; `claude-plugin.json` and `server.json` kept shipping
  ~102.3M / 29 and received nothing but a version bump. All four now read ~116.2M / 30,
  measured 2026-08-11 from `/api/public/stats`.
- **Version drift fixed.** `index.js` still announced itself to clients as `0.7.0` while the
  package was `0.7.1`. The wire version, `package.json`, `server.json` and
  `claude-plugin.json` are now all `0.7.2`.

## 0.7.1 — 2026-08-10

- `find_similar` stopped telling every installing agent it was dead: the "TEMPORARILY
  UNAVAILABLE … returns 503" note was true only while the ANN index was dropped, and the
  index has been rebuilt as IVFFlat. The real limit is coverage (~1.9% of the corpus
  embedded), and an entity outside it gets an empty list, not an error.

## 0.7.0 — 2026-07-22

- **Semantic (meaning-based) retrieval.** Two new tools over the corpus-RAG dossier
  cards: `semantic_search` (BGE-M3 vector ANN — find companies/people whose profile is
  closest to a natural-language query, even with no keyword match; complements the lexical
  `search_entities`) and `find_similar` ("more like this" around a known `entity_id`).
  Both return `entity_id, caption, kind, jurisdiction, risk` + a similarity score. Coverage
  grows as the embedding backfill runs — results may be sparse until then.

## 0.6.0 — 2026-07-21

- **Agents can pay.** Three new tools drive a one-off dossier purchase end-to-end:
  `get_pricing` (the honest static price list + the machine buy-flow),
  `buy_dossier` (guest Stripe Checkout — Standard €39 / Premium €99, packs of
  5/25 — returns a `checkout_url` a human or payment-capable agent completes)
  and `claim_dossier` (redeems the paid `session_id` for a 90-day entity-scoped
  access token; idempotent, `402 not_paid` until payment lands).
- `get_dossier` accepts an optional `token`: a claimed Standard token unlocks
  the full multi-hop UBO chain + year-over-year financial history for that
  entity; a Premium token additionally unlocks itemised assets (vessels,
  aircraft, securities, real estate). 13 → 16 tools.

## 0.5.1 — 2026-07-16

- `get_pulse` gains an optional `since` (ISO-8601) sync cursor: poll it with the
  `next_since` from your last response to stream only newly-ingested events — the
  changes-feed you monitor the corpus against.

## 0.5.0 — 2026-07-16

- New `resolve` tool: batch-resolve a list of company names or `scheme:value`
  identifiers to canonical entity ids + confidence in one call — enrich a whole
  supplier / counterparty / portfolio list without one lookup per row.
- `lookup_by_identifier` now accepts the `siren` scheme (French SIREN).
- Rolls up the previously-unpublished 0.4.0 tools — `get_company_details`
  (registered address / status / SIC / filing & compliance), `get_financials`
  (turnover / profit / net assets / cash / employees, year-over-year) and
  `get_pulse` (the live corpus activity feed). 9 → 13 tools.

## 0.3.2 — 2026-07-09

- `search_entities` now accepts optional `type` (company/person/asset), `juris`
  and `risk` filters, matching the REST endpoint and the published docs.
- Better error handling: 4xx responses surface the API's actual reason instead
  of a generic "retry shortly", and only 5xx/429 advise a retry (echoing
  `Retry-After`). Agents no longer blindly retry a 400/404.

## 0.3.x — 2026-06/07

Grew to 9 tools (added `get_dossier`, `get_sanctions`, `get_offshore_exposure`,
`lookup_company` variants) and an optional `WHITEINTEL_API_KEY` (Bearer `wi_`)
that attributes usage to your account/plan; the anonymous free tier still works
with a monthly allowance.

## 0.1.0 — 2026-06-19

Initial release. Stdio MCP server exposing WhiteIntel's public API as 5 tools:
`lookup_company`, `search_companies`, `search_entities`, `get_entity`,
`trace_ownership_path`. Forwards to `https://whiteintel.dev/api/public/*`
(SSRF-guarded base, 30s timeout). Free & open, no auth.
