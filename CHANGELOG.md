# Changelog

## 0.7.8 — 2026-08-19 — the coverage map is a tool now (21 → 22), and the version drift is closed

Adds `list_jurisdictions`: the presence-first coverage map as a tool, so an agent reads HOW a country
is held before claiming it is or is not covered — `deep` (the whole national registry is loaded, so
every company there is searchable), `indexed` (only the leak/sanctions/GLEIF subset), or `on_demand`
(the registry is closed/paid, so the specific record is procured from source when a dossier is
purchased). Backed by the new `GET /api/public/coverage`; the per-record vendor and price are never
exposed on that surface. This is the agent-facing twin of the `/jurisdictions/{code}` pages shipped
the same day.

Also closes a version drift the manifest guard had been failing on: `index.js` and
`claude-plugin.json` sat at 0.7.6 while `package.json`/`server.json` were 0.7.7. All six version slots
are now 0.7.8, the tool count is 22 across every manifest, and `server.json` — which stated neither a
tool count nor a corpus figure — now carries both. `npm test` is 8/8 green and the wire smoke confirms
22 tools at 0.7.8.

## 0.7.4 — 2026-08-11 — the tool a human can actually finish (20 → 21), and nine descriptions that were overstating

Two things shipped here. One is a missing tool. The other is the harder half: this package has
twice shipped a description that lied to an installing agent — a `find_similar` blurb saying a
working tool was broken, and an identifier scheme that resolved to zero rows — so every one of the
now-21 descriptions was re-read against a live production response before this version was cut.
Nine of them were wrong. Every number below came out of a command whose output is in the session
log; nothing here was inferred from a route file.

### The gap: `get_payment_link` existed on the hosted surface and not in the package

Measured first, both surfaces, same minute:

```
POST https://whiteintel.dev/api/mcp  {"method":"tools/list"}   -> 21 tools
npx -y github:Hei33enberg/WhiteIntel-OS  (initialize+tools/list) -> 20 tools,
                                            serverInfo.version 0.7.3
diff = exactly one name: get_payment_link
```

Then the endpoint it needs, because you do not advertise a tool pointing at something you have not
called:

```
GET https://whiteintel.dev/api/public/paylinks
  -> HTTP 200, Cache-Control: public, max-age=3600
  -> { links: [standard:25, standard:5, standard:single], how_to_use: [4 strings] }
```

It answers, so the tool ships. Note what that body does **not** contain: any premium link. The
hosted description implies the links cover "the one-off dossiers"; measured, they cover Standard
only. This package says so, and says Premium still needs `buy_dossier`.

Why this is not a parity nit. 100% of the 205,497 purchase offers this company has ever served went
to machine callers with no card. `buy_dossier` hands back a Checkout Session that is single-use and
dead in 24 hours — worthless in a report a human opens tomorrow. `get_payment_link` returns a URL
that still works next week. That is the difference between an offer and a sale, and for four
releases it was reachable over HTTP and missing from the package every local client installs.

`get_pricing` gained the hosted surface's step 0 (no human at the keyboard → use
`get_payment_link`), and its `api.metered` line was aligned with the hosted payload, which the two
surfaces disagreed about: this one billed search as metered, the hosted one calls search, entity
lookup and MCP free.

### `max_depth` is a request, not a promise — and four descriptions were selling it as a promise

The worst finding. Anonymously, against production, 2026-08-11:

```
/api/public/ownership-path?root=<barclays>&max_depth=6   -> max_depth: 2, depth_capped: true, plan: free
/api/public/graph/path?...&max_depth=4                   -> max_depth: 2, depth_capped: true, plan: free
/api/public/graph/neighbourhood?...&depth=3              -> depth: 2,     depth_capped: true, plan: free
/api/public/offshore-exposure/<barclays>?max_depth=6     -> depth_walked: 1, depth_capped: true,
                                                            verdict: checked_full_clean
```

The free plan caps every walk at two hops. Nothing in the old descriptions said so; they documented
the argument's range (up to 10 hops on `trace_ownership_path`) as if the caller got what it asked
for. An agent that asks for six hops to the UBO, receives two, and reads no further will write the
name of an intermediate holding company into a due-diligence report as the beneficial owner. All
four descriptions now tell the caller to read the RETURNED `depth` / `max_depth` / `depth_walked`
and `depth_capped`, and to scope its sentences to that number.

`check_offshore_exposure` needed a second correction on top. The old text mapped
`checked_full_clean` to "walked the full chain" and `depth_capped` to "the plan shortened the walk".
Measured, the two co-occur: the walk above ended at one hop — genuinely out of chain, below the
two-hop ceiling — and still reported `depth_capped: true`. So `depth_capped` means *a cap was in
force*, not *the cap bit*, and `checked_full_clean` is not a licence to write "no offshore
exposure" without quoting `depth_walked`.

### `graph_neighbourhood` returns every edge twice at depth ≥ 2, and the payload does not say so

Four roots, `depth=2`, raw edges vs distinct on `from|to|predicate`:

```
BARCLAYS PLC        59 raw / 33 distinct
BARCLAYS BANK PLC  133 raw / 91 distinct
Barclays Bank Uk    48 raw / 35 distinct
GAZPROM (U.K.)       4 raw /  2 distinct
depth=1 on the same roots: 25/25, 26/26, 7/7 — clean
```

`edge_count` counts the duplicated list, and the duplicates are charged against the `edges` budget,
so a call can report `truncated: true` while holding far fewer distinct edges than the budget you
set. A database fix is in flight and is deliberately **not** described here — the description states
today's behaviour and tells the caller to de-duplicate before counting relationships. What the old
description got right is confirmed: with `edges=10` the response did come back `truncated: true`
with a plain-language `truncation_note`.

One claim we could **not** reproduce, and therefore do not repeat: a reported silent downgrade of
depth 2 to depth 1 with `depth_capped: false`. Six consecutive `depth=2` calls on the densest root
returned `depth: 2` with edges at depth 2 present every time. It may be load-dependent. The
instruction to read the returned `depth` stands on its own without it.

### The rest, each measured

- **`get_pulse`** named the wrong registry. Its `ownership` stream was documented as GLEIF;
  the newest 100 rows were **100% `borme`** — Spain's Boletín Oficial del Registro Mercantil. And
  the old text insisted the default feed "is NOT ownership-only": the newest 100 rows of the
  unfiltered feed were **100% `ownership`**, because the feed is ordered by ingest recency and
  whichever loader ran last fills its head. Citation coverage, the one thing that description got
  right, held everywhere: 100/100 rows carried a `source_url` on all four kinds.
- **`get_sanctions`** is not sanctions-only despite the name. BARCLAYS BANK PLC returned
  `sanctioned: false` **with** a HIGH-severity `signal_type: 'crime'` row (a criminal/wanted
  listing from `opensanctions_crime`, reaching it via its cluster) — and `list` and `regime` were
  null on it, so a null `list` is not missing data. A `sanctioned: false` response can carry an
  adverse finding you are obliged to report.
- **`semantic_search` / `find_similar`** were sold as general meaning-based corpus search. The
  endpoint's own `coverage` object: **990,055 embedded of a 47,486,969 universe (2.1%), ~99.6%
  risk-listed, ~97% natural persons.** In practice it is a risk-list search — "sanctioned russian
  aluminium holding" returned sanctioned Russian *ships* as its top hits, and `find_similar` on
  BARCLAYS BANK PLC returns `count: 0`. Both descriptions now say which slice they search, and that
  empty means "not embedded", never "no peers exist". `semantic_search` also carries its measured
  6.4 s cold latency.
- **`get_financials`** called balance-sheet coverage "broad". Sampling 48 UK company entities from
  `search_entities`: **11 returned any filed period.** The other 37 answered HTTP 200 with an empty
  `financials` and a `note` — BARCLAYS BANK PLC (CH 01026167) among them. `get_company_details`
  came out of the same sample at **45 of 48**, so it now carries that number as a contrast.
- **`resolve`** documented `confidence: 'name'` without saying what it costs you. The query
  "Tesco" resolved to a **French** company literally named TESCO (`fr-siren:454067281`), while
  `gb-coh:00445790` resolved 'exact' to TESCO PLC. A 'name' hit is a candidate. Unmatched rows come
  back `{ match: null, confidence: null }`; the 25-item anonymous limit was verified by a 26th item
  returning HTTP 400.
- **`lookup_by_identifier`** — all eleven schemes were exercised against production and every one
  resolved a real entity, `lei` and `uen` included (both needed values pulled from the corpus
  first; a format-valid LEI that we simply do not hold 404s, which is how the earlier `nip` ghost
  hid). The description now separates the two failure modes an agent will otherwise conflate:
  unsupported scheme → **400** with the accepted set in `detail`; supported scheme, unheld value →
  **404**. `cy-reg` → 400 verified; `cusip:` appears on US rows and is likewise not accepted.
- **`search_entities`** pointed at `get_entity (registry_profile)` for provenance. It is populated
  on **22 of 32** sampled entities, so the description now names the fallbacks
  (`linked_records[].registry`, `connections[].source`). Its "full corpus" claim held: one name
  search returned FR, BR and US rows across `siren`, `lei`, `br-cnpj` and `cusip`.
- **`trace_ownership_path`** promised "the ordered chain(s)". It returns one flat `hops` array.

Corpus figures re-read from `/api/public/stats` and left alone because they were right: 29
registries, 116,163,032 entities, 21,452,620 relationships.

### Guardrails

`test/smoke.mjs` asserted `tools.length >= 9`. A floor is how this package shipped 0.7.0 with two
tools missing and nothing failing. It now asserts the **exact** 21 names — so a rename surfaces as
a named diff rather than an unchanged count — that every tool carries a description and an
inputSchema, and that `serverInfo.version` equals `package.json`, the drift that produced 0.7.0
vs 0.7.1 and a hosted surface reporting 0.7.0 while the package was 0.7.3.

```
$ npm run smoke
whiteintel-mcp-server running on stdio · 21 tools · API https://whiteintel.dev · anonymous (free tier)
OK: serverInfo.version 0.7.4 matches package.json
OK: tools/list returned 21 tools, all named and described
$ npm test
# pass 4  # fail 0
```

Version bumped in all five places that can disagree: `package.json`, `package-lock.json`,
`server.json` (twice), `claude-plugin.json`, and the `Server()` constructor in `index.js` that the
client actually reads over the wire.

## 0.7.3 — 2026-08-11 — bounded graph walk (2 new tools, 18 → 20)

The app-side API and the DB functions landed first (WhiteIntel migration 0295, LINEAR-4806);
this package describes them so the two surfaces stay in step. Both endpoints were measured live
against production before this version was cut, not assumed from the route files:

```
GET /api/public/graph/neighbourhood?root=<uuid>&depth=2&edges=120  ->  200 in 0.96s
GET /api/public/graph/path?from=<uuid>&to=<uuid>&max_depth=3       ->  200 (400 + a clear
                                                                        message when from == to)
```

### Install channel changed: `claude-plugin.json` and `mcp.json` now install from GitHub

Measured 2026-08-11: `npm view @whiteintel/mcp-server version` returns **0.7.0** while this source
tree is 0.7.3. Anyone installing through the plugin catalogue was therefore getting a package three
versions behind — 18 tools, no graph tools at all, and a `find_similar` description that told the
calling agent the tool was broken when it was not.

This package has no build step and the repository is public, so `github:` resolves to exactly this
code:

```
npx -y github:Hei33enberg/WhiteIntel-OS
```

Both manifests now point there. `server.json` still declares the npm package, because that is what
the MCP registry entry describes — switch every one of them back to `@whiteintel/mcp-server` on the
day `npm view` reports the current version.

### Corpus figures corrected again

`index.js`, `server.json` and `claude-plugin.json` each claimed **30 registries**. Measured from
`/api/public/stats` at 2026-08-11 05:30Z: **29**. The entity count, ~116.2M, was already right
(116,163,032). This is the third consecutive release in which a hardcoded corpus number in a
manifest was wrong — the manifests are what the catalogue and the installer read, and they are the
files that keep getting missed.

- **`graph_neighbourhood`** — every ownership/control edge within N hops of an entity, in
  BOTH directions. Fills the hole between `get_entity` (direct relationships only) and
  `trace_ownership_path` (upward only). Depth 1–3, edge budget 10–300.
- **`graph_path`** — the ordered hops connecting two entities, or an explicit "not found
  within these bounds".

**The bounds are in the database, not in this package.** Depth, edge budget and a
per-entity fan-out cap are constants inside the Postgres functions; no tool argument can
widen them. Measured on the fattest node in the corpus (22,420 edges on one entity):
a full-cap neighbourhood returns in 9.6 ms, and the caps hold even when the caller asks
for depth 99 and a million edges. This is deliberate history — `/api/public/similar` once
consumed 3.8 GB on a single call and answered 503 because its cost tracked the data
instead of the contract.

**`graph_path` reports a bounded negative, and says so.** At most 15 edges are followed
per entity, per direction, per hop. `found: false` means no path was found within those
bounds; it is not evidence that two entities are unconnected, and the payload carries
`exhaustive: false` plus a `bounds_note` so an agent cannot honestly write "no link"
into a report. A due-diligence tool that turns "we did not look far enough" into a clean
bill of health is worse than one that returns nothing.

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
