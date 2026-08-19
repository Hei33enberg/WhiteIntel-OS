<div align="center">

<img src="https://raw.githubusercontent.com/Hei33enberg/whiteintel-mcp-server/main/logo-mark-512.png" width="132" alt="WhiteIntel" />

# @whiteintel/mcp-server

**They trace names. We trace who really owns them.**

The corporate-ownership & sanctions intelligence layer for AI agents — built for the agentic era. WhiteIntel turns public-registry and offshore-leak data into MCP-native intelligence primitives — **entity search, semantic discovery, ownership-path traversal, sanctions screening, offshore-exposure detection, and fully cited dossiers** — so any AI agent can investigate a company, trace its ultimate beneficial owner, and flag risk in one conversation. Your agent isn't querying a database — it's conducting an investigation.

**[Read the Methodology →](https://whiteintel.dev/methodology)**

[![npm](https://img.shields.io/npm/v/@whiteintel/mcp-server.svg)](https://www.npmjs.com/package/@whiteintel/mcp-server)
[![CI](https://github.com/Hei33enberg/whiteintel-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/Hei33enberg/whiteintel-mcp-server/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f7d4f.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-7c3aed.svg)](https://modelcontextprotocol.io)
[![Tools](https://img.shields.io/badge/tools-21%20live-00ff7f)](https://whiteintel.dev/developers)
[![Corpus](https://img.shields.io/badge/corpus-130.7M%20entities-2f7d4f)](https://whiteintel.dev/coverage)
[![Sources](https://img.shields.io/badge/sources-31%20fused-2f7d4f)](https://whiteintel.dev/sources)
[![whiteintel.dev](https://img.shields.io/badge/site-whiteintel.dev-5af082)](https://whiteintel.dev)

</div>

---

## What's live today

**One command, any MCP agent:**

```bash
npx -y @whiteintel/mcp-server
```

…starts an MCP server with **23 tools** that give any AI agent — Claude Desktop, Cursor, Cline, Windsurf, or your own runtime — **full corporate-ownership intelligence**: search by name or meaning, trace ownership chains to the UBO, screen sanctions across OFAC/EU/UN/UK, detect offshore layering, pull fully cited dossiers with financials and asset layers, and even purchase deeper intelligence through agent-initiated Stripe checkout. Every claim cited to its source, every edge traced to a registry record.

| Tool | What it does | Category |
|---|---|---|
| `search_entities` | Search the corpus (companies + people) by name → entity ids | 🔍 Discovery |
| `semantic_search` | Meaning-based search (BGE-M3 vector ANN) — find entities by profile, not keywords | 🔍 Discovery |
| `find_similar` | "More like this" — nearest entities to a known id, for peer discovery and clustering | 🔍 Discovery |
| `search_companies` | Free-text company-name search → registration number | 🔍 Discovery |
| `lookup_company` | UK company by Companies House number → record + ownership graph | 📋 Lookup |
| `lookup_by_identifier` | Resolve by strong id — LEI, OFAC/EU/UN/UK sanctions id, UEN, SEC CIK, KRS, GB-COH, SIREN, Brazil RFB CNPJ | 📋 Lookup |
| `get_entity` | Full record for one entity + its direct relationships | 📋 Lookup |
| `resolve` | Batch-resolve names or `scheme:value` ids → canonical entity ids + confidence | 📋 Lookup |
| `get_dossier` | Structured, fully-cited dossier: identity, ownership/UBO chain, risk, provenance | 📊 Intelligence |
| `trace_ownership_path` | Walk ownership upward to the ultimate beneficial owner | 📊 Intelligence |
| `graph_neighbourhood` | Every edge within N hops of an entity, both directions — hard-capped, says when the view is partial | 🕸️ Graph |
| `graph_path` | How two entities are connected — **bounded, not exhaustive**: `found: false` is not proof of no link | 🕸️ Graph |
| `get_sanctions` | Sanctions exposure (OFAC/EU/UN/UK) for entity and its resolved cluster siblings | 🛡️ Risk |
| `check_offshore_exposure` | Flag sanctioned + secrecy-jurisdiction hops in the ownership chain | 🛡️ Risk |
| `get_company_details` | UK register detail: address, status, SIC, filings, charges, former names | 📋 Lookup |
| `get_financials` | Filed UK financials YoY (turnover, profit, net assets, cash, employees) | 📊 Intelligence |
| `get_pulse` | Live corpus activity feed — recent ownership/control changes, sourced | 📊 Intelligence |
| `get_pricing` | Full price list + machine-readable purchase flow (static, no network call) | 💳 Commerce |
| `buy_dossier` | Start a one-off dossier purchase via guest Stripe Checkout → `checkout_url` | 💳 Commerce |
| `get_payment_link` | Permanent, reusable Stripe payment links — the artefact you hand to a human | 💳 Commerce |
| `claim_dossier` | Redeem a paid session for a 90-day access token (idempotent) | 💳 Commerce |

**21 callable tools** — 4 Discovery + 4 Lookup + 4 Intelligence + 2 Graph + 2 Risk + 3 Commerce + 1 Feed + 1 Pricing. All read-only except `buy_dossier` (opens Stripe — money moves only when a human completes it) and `claim_dossier` (redeems an already-paid session). Ids flow between tools: search → get_dossier → trace_ownership_path → get_sanctions.

## Quickstart (60 seconds)

> **Distribution:** the package is on npm — `npx -y @whiteintel/mcp-server` Just Works.

**1. Run it.** No key needed — works anonymously on the free tier:

```bash
npx -y @whiteintel/mcp-server
```

**2a. Claude Desktop / Cursor** — add to your MCP config:

```json
{
  "mcpServers": {
    "whiteintel": {
      "command": "npx",
      "args": ["-y", "@whiteintel/mcp-server"],
      "env": { "WHITEINTEL_API_KEY": "wi_…" }
    }
  }
}
```

**2b. Claude Code CLI:**

```bash
claude mcp add whiteintel -- npx -y @whiteintel/mcp-server
```

**2c. One-click:** add WhiteIntel to your editor at **[whiteintel.dev/developers](https://whiteintel.dev/developers)**.

The `env` block is optional — omit it to use the anonymous free tier. Set `WHITEINTEL_API_KEY=wi_…` to authenticate as your plan and lift limits.

### Try it

> **You:** "Who ultimately owns Revolut? Check sanctions on the whole chain."
>
> **Agent:** calls `search_entities({ query: "Revolut" })` → `trace_ownership_path({ id })` → `get_sanctions({ id })` for each hop → a fully cited ownership chain with sanctions screening at every level. Done.

> **You:** "Find companies similar to Wirecard and check for offshore exposure."
>
> **Agent:** calls `find_similar({ entity_id })` → `check_offshore_exposure({ id })` → flagged secrecy-jurisdiction hops and sanctioned intermediaries across the peer set.

## Agents can pay

An agent can buy the paid depth of a dossier end-to-end, **no WhiteIntel account needed:**

1. **`buy_dossier`** `{ tier: "standard" | "premium", entity_id }` → returns a Stripe `checkout_url`. Standard (€39) unlocks the full multi-hop UBO chain + financials; Premium (€99) adds aircraft, sanctioned vessels and property; on HIGH-risk or sanctioned subjects it additionally runs a live adverse-media scan (that scan is gated — it does not run on lower-risk entities).
2. A **human completes payment** at the `checkout_url` — Stripe collects an email and redirects back.
3. **`claim_dossier`** `{ session_id }` → `{ token, entity_id, tier }`. Idempotent; returns `402` until paid.
4. **`get_dossier`** `{ id, token }` → the unlocked, fully-cited dossier JSON. Tokens valid 90 days.

**No human at the keyboard right now?** Step 1 is the wrong tool: a `checkout_url` is single-use and expires in 24 hours, so it is dead by the time someone reads your report. Call **`get_payment_link`** instead — it returns permanent Stripe links you can paste into a document, a ticket or a message, and append `?client_reference_id=<entity uuid>` to bind one to a specific company. Measured 2026-08-11: those links cover the **Standard** tier only (single / 5 / 25); Premium still goes through `buy_dossier`.

Check **`get_pricing`** first — it returns the full price list plus this flow in machine-readable form.

## The corpus

**~130.7M entities across 31 fused registries** — every claim cited, every edge traced.

*Measured 2026-08-16 from [whiteintel.dev/api/public/stats](https://whiteintel.dev/api/public/stats) (`entities` = 130,735,728, itself a planner estimate). That endpoint rebuilds its source map by counting registries, so it is always the authority — and a new source shows up there without anyone editing this file.*

| Source | What | Coverage |
|---|---|---|
| **OpenOwnership** | UK PSCs (Persons with Significant Control) | 🇬🇧 Full |
| **GLEIF** | Global LEI registry + parent/child ownership relations — nightly refresh scheduled | 🌍 Global |
| **ACRA Singapore** | Singapore company registry | 🇸🇬 Full |
| **ICIJ Offshore Leaks** | Panama Papers, Paradise Papers, Pandora Papers | 🌍 Offshore |
| **SEC EDGAR** | US securities filings + beneficial ownership | 🇺🇸 Full |
| **UK Companies House** | Full UK register — bulk + live filing stream | 🇬🇧 Full |
| **FAA** | US aircraft registry (tail numbers → owners) | 🇺🇸 Full |
| **France SIRENE** | French company register | 🇫🇷 Full |
| **Brazil RFB** | Brazilian federal revenue — CNPJ register | 🇧🇷 Full |
| **Cyprus DRCOR** | Cypriot register — **officers only** (see scope note below) | 🇨🇾 Loading |
| **OFAC / EU / UN / UK** | Consolidated sanctions lists | 🌍 Live |
| **+ 15 more** | registries, sanctions lists & UBO registers | 🌍 Growing |

### Cyprus — what it is, and what it is not

Cyprus went to production on **2026-08-11** and is **still loading** — so we quote no frozen row count here; ask [`/api/public/stats`](https://whiteintel.dev/api/public/stats) for the current figure.

**Read this before you sell it as Cyprus ownership coverage — it is not.** The Cypriot open data release covers the **nominal layer only: directors, secretaries and trade-name owners.** It contains **no shareholders and no beneficial owners.** Measured on a sample of the loaded edges, roughly **93% are `Directorship`** (Director, Secretary, Authorised Person, general partner) and the remaining **~7% carry the `Ownership` schema with role `Owner`** — those are trade-name proprietorships, a sole trader registered behind a business name, not shareholding in a company. An earlier version of this paragraph said there was "not one ownership edge" in the Cyprus data; that was wrong, and it is corrected here rather than quietly deleted, because a claim about what a source does not contain is exactly the kind of sentence a buyer relies on.

The practical consequence is unchanged and is the part that matters: a Cypriot **company** will typically answer `trace_ownership_path` and `check_offshore_exposure` with `no_ownership_data`. That verdict means *we hold no ownership edges for this subject*, **not** *this company is cleanly owned*. Do not read the 7% as shareholder coverage — it is not.

Cypriot records carry a `cy-reg:` identifier. `lookup_by_identifier` does **not** accept that scheme — reach them with `search_entities` using `juris: "cy"`.

> Contains information from the Cyprus Department of Registrar of Companies and Intellectual Property, licensed under CC BY 4.0.

**Semantic search** (`semantic_search` / `find_similar`) runs over resolved dossier cards using BGE-M3 embeddings; coverage grows as the embedding backfill completes. Measured 2026-08-11 from the endpoint's own `coverage` payload: **990,055 of a 47,486,969 universe embedded (2.1%), and that slice is ~99.6% risk-listed and ~97% natural persons** — so today these two tools behave much more like a sanctions/PEP search than a corpus search, and an empty result usually means "not embedded yet". Lexical `search_entities` always covers the full corpus; pair it with either of them before drawing a conclusion.

## Why WhiteIntel

> **What's in a name:** White + Intel — **white** as in transparent, open, cited; **intel** as in intelligence, not data. We don't sell raw records — we sell resolution, traversal, and cited delivery.

Existing corporate-ownership tools were built for compliance analysts clicking web forms. WhiteIntel is the intelligence layer for the agentic era — where the investigator might be a person, an autonomous agent, or an AI workflow, and they all need the same cited, traversed, risk-scored intelligence.

- **Cited, not claimed.** Every ownership edge, every sanctions flag, every risk signal is traced to a public-registry record with a real effective date. We don't invent or infer — if a source doesn't say it, we don't.
- **MCP-native, not another API wrapper.** Semantic intelligence primitives — not REST endpoints shoe-horned into tool definitions. One command, any MCP agent.
- **Freemium by design.** The public corpus is free to explore — no sign-in, no API key, no paywall on search. You pay only for depth: full UBO chains, asset layers, monitoring, and export.
- **Agents can pay.** The only MCP server where an agent can investigate a company, decide it needs the paid dossier, buy it via Stripe Checkout, and receive the cited intelligence — end-to-end, no human portal needed.
- **Honest about gaps.** An absent edge means "not yet observed", not "does not exist". Investigative **decision-support**, not a legal determination of beneficial ownership.
- **No lock-in.** MIT license. Your agent, your data, your investigation.

## Data & honesty

- **Live corpus:** ~130.7M entities across 31 fused registries (measured 2026-08-16). Live counts, always authoritative over this file: [whiteintel.dev/api/public/stats](https://whiteintel.dev/api/public/stats).
- **Sources are not uniformly deep.** A registry in the list means we hold *what that registry publishes* — which for some jurisdictions is the officer layer, not ownership. Cyprus is the clearest case (see the scope note above). Never read presence in the source table as ownership coverage.
- An absent edge means "not yet observed", not "does not exist".
- Investigative **decision-support**, not a legal determination of beneficial ownership.
- Semantic search coverage grows as the embedding backfill completes — lexical search always covers the full corpus.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `WHITEINTEL_API_KEY` | _(none)_ | Optional `wi_` key ([whiteintel.dev → Settings → API keys](https://whiteintel.dev/settings)). Authenticates as your plan, lifts free-tier limits. |
| `WHITEINTEL_API_BASE` | `https://whiteintel.dev` | API origin (SSRF-guarded to whiteintel.dev hosts). |
| `WHITEINTEL_TIMEOUT_MS` | `30000` | Per-request timeout. |

## Ecosystem

WhiteIntel is part of a growing intelligence platform:

- **[whiteintel.dev](https://whiteintel.dev)** — the web app: search, graph, dossiers, Pulse feed, monitoring
- **[WhiteIntel API](https://whiteintel.dev/developers)** — REST API with OpenAPI spec, the same endpoints this MCP server calls
- **[WhiteIntel Pulse](https://whiteintel.dev/feed)** — live ownership/control change feed across the corporate graph
- **[@whiteintel/mcp-server](https://www.npmjs.com/package/@whiteintel/mcp-server)** — this package: the MCP intelligence layer

## Who's behind this

WhiteIntel is built and directed by [@Hei33enberg](https://github.com/Hei33enberg) — a self-funded, independent intelligence project. No venture capital, no data brokers, no compromises on citation integrity.

*Swiss governance · Honest by construction*

## Get on the graph

```bash
npx -y @whiteintel/mcp-server     # 23 tools, any MCP agent
```

- **Install** — drop the server into Claude Desktop, Cursor, Cline, Windsurf, or your own runtime (see [Quickstart](#quickstart-60-seconds)).
- **No key needed** — works on the anonymous free tier out of the box.
- **Go deeper** — set `WHITEINTEL_API_KEY` for your plan's full depth.
- **Explore the corpus** — [whiteintel.dev](https://whiteintel.dev) — free to search, no sign-in.
- **Own it** — [star the repo](https://github.com/Hei33enberg/whiteintel-mcp-server), build on the API, or integrate into your agent pipeline. MIT, no lock-in.

## Contributing

Issues, PRs, and tool ideas welcome. Start with the [CHANGELOG](./CHANGELOG.md) for what's shipped and what's next. If you're building an agent that uses corporate intelligence, we want to hear about it — [intel@whiteintel.dev](mailto:intel@whiteintel.dev).

**Community:** [GitHub Issues](https://github.com/Hei33enberg/whiteintel-mcp-server/issues) for bugs and features, [GitHub Discussions](https://github.com/Hei33enberg/whiteintel-mcp-server/discussions) for design and help.

Web: [whiteintel.dev](https://whiteintel.dev) · npm: [@whiteintel/mcp-server](https://www.npmjs.com/package/@whiteintel/mcp-server) · Releases: [GitHub](https://github.com/Hei33enberg/whiteintel-mcp-server/releases)

## License

[MIT](./LICENSE) © whiteintel.dev
