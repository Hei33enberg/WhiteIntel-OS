---
name: corporate-ownership-investigation
description: Trace who ultimately owns or controls a company, screen it for sanctions, and report the result without overclaiming. Use when asked "who owns X", "who is behind X", "is X sanctioned", "is X connected to Y", "what does X own", or when doing KYC/AML/due-diligence, counterparty checks, supply-chain screening, or offshore/UBO research. Works over the free WhiteIntel corpus (~130.7M entities, 31 public registries) via MCP tools or plain HTTP.
license: MIT
---

# Corporate ownership investigation

Answer "who really owns this company?" from public registries — and, just as importantly, know
when the honest answer is "we cannot see that from here".

## Why this skill exists

Ownership questions are where confident-sounding answers do the most damage. A due-diligence
sentence like *"X has no offshore exposure"* is a claim about the whole world; what the data
usually supports is *"no exposure over the two hops we could walk"*. This skill is mostly about
that gap: the calls are easy, the honest reading is not.

## Setup

Either transport works; no account and no key are needed for the free tier.

- **MCP (preferred)**: `npx -y @whiteintel/mcp-server` — 23 tools.
  Hosted alternative for clients that cannot spawn a subprocess: POST JSON-RPC 2.0 to
  `https://whiteintel.dev/api/mcp`.
- **Plain HTTP**: `https://whiteintel.dev/api/public/*` — same data, no install.
  Every page also has a markdown twin for reading: append `.md` to an entity or hub URL.

Set `WHITEINTEL_API_KEY` (a `wi_` key) only if you have one — it lifts depth caps.

## The core loop

### 1. Resolve the name to an id — never investigate a string

```
search_entities { q: "Acme Holdings", juris: "gb" }     # lexical, covers the FULL corpus
resolve { queries: ["gb-coh:00445790", "Acme Holdings"] }   # batch; identifiers beat names
```

A **name match is a candidate, not a resolution.** Measured: `"Tesco"` resolves to a *French*
company literally named TESCO, while `gb-coh:00445790` resolves exactly to Tesco PLC. If you hold
any registry identifier (LEI, company number, SIREN, CNPJ, UEN, CIK), pass that instead —
`lookup_by_identifier` takes eleven schemes.

Before reporting "not found", try both `search_entities` (lexical, full corpus) **and**
`semantic_search` (meaning-based but only ~2% embedded and skewed to risk-listed people).
An empty semantic result usually means "not embedded", not "does not exist".

### 2. Check what coverage you actually have for that country

```
list_jurisdictions        # per country: tier, scope, record depth
```

This one call prevents most false conclusions:

| tier | what it means for your answer |
|---|---|
| `deep` + `scope: full` | the whole national registry is loaded — every company there is searchable |
| `indexed` / `scope: subset` | only the leak & sanctions fragment is held; **absence proves nothing** |
| `on_demand` | closed/paid registry — the record is procured when a report is purchased |

And `depth` tells you whether owners are even in scope: `ownership` (owners/UBO on the record),
`officers` (directors only), or `identity` (name/number/address only — owners are *not* held).

So: no ownership edge for a company in a `deep`+`ownership` country is meaningful evidence.
The same silence in an `identity`-depth or `subset` country is **no evidence at all**. Say which.

### 3. Walk the ownership chain upward

```
trace_ownership_path { root: "<id>", max_depth: 6 }
```

**`max_depth` is a request, not a promise.** Read the *returned* `max_depth`, `hop_count` and
`depth_capped`. Measured on an anonymous caller: a request for 6 came back as
`max_depth: 2, depth_capped: true, plan: "free"` — the walk stopped two hops up and only those
fields said so. If the walk was capped and the topmost owner still has owners, you have found an
**intermediate holder, not the beneficial owner.**

`as_observed` is a standing caveat: edges carry the date we *observed* them in a registry, not a
validity period. We hold no ownership end-dates, so a link shown may already have ended.

### 4. Screen for sanctions — and read the whole response

```
get_sanctions { id: "<id>" }
```

Despite the name this is **not sanctions-only** — check each row's `signal_type`. Measured:
BARCLAYS BANK PLC returns `sanctioned: false` *with* a HIGH-severity `crime` signal reaching it via
its resolved cluster. So a `false` flag can still carry an adverse finding you must report.

Distinguish `sanctioned_self` (a designation **on this entity**) from `sanctioned_via_cluster`
(it reaches the entity only through a cross-source sibling — there is a ~2.3% false-positive tail
on UK resolution). Treat cluster-only hits as a lead to verify, never as a finding.

### 5. Offshore exposure — branch on the verdict, not the boolean

```
check_offshore_exposure { id: "<id>", max_depth: 6 }
```

Four states, and only one is clean:

- `no_ownership_data` — we hold no ownership edges. **Exposure was not evaluated.** Not clean.
- `flagged` — a sanctioned or secrecy-jurisdiction hit sits on the walked chain.
- `checked_to_max_depth_truncated` — the cap was reached with chain still above. **Not clean.**
- `checked_full_clean` — the chain genuinely ran out before the cap.

Even `checked_full_clean` co-occurs with `depth_capped: true`. Always quote `depth_walked`:
*"clean over the one hop of ownership we hold, on a walk the free tier limits to two."*

### 6. Widen, and connect two parties

```
graph_neighbourhood { root: "<id>", depth: 2 }   # both directions: owns + owned-by
graph_path { from: "<id-a>", to: "<id-b>" }      # how two entities connect
```

Both are **bounded, not exhaustive** — at most 15–25 edges are followed per node per direction per
hop. `found: false` means *no path within those bounds*; it is **not** evidence that two parties
are unconnected, and must never be reported as a clean result. `graph_neighbourhood` reports
`depth_walked` (measured from the returned edges) separately from `depth_requested` — cite the
former. `truncated: true` is normal for hub entities (single nodes exceed 22,000 edges).

### 7. Assemble the cited report

```
get_dossier { id: "<id>" }
```

Returns identity with cross-source linked records, ownership/control, risk signals and provenance
on every layer. The free tier shows the first ownership hop and the latest financial period; a
purchased token or an API key unlocks the full chain. Every claim carries a source URL — **quote
them**, that is the whole point of using this corpus rather than a model's memory.

For UK companies, `get_company_details` (registered address, filings, overdue flags, former names)
is well populated; `get_financials` is **sparse by design** — measured, only 11 of 48 sampled UK
companies had any filed period. An empty `financials` with a `note` is the normal answer, not an
error. "No filings held" ≠ "no revenue".

## Reporting rules

1. **Scope every negative.** "No X found" → "no X **in the sources we hold, over N hops walked**".
2. **Never promote an intermediate holder to "beneficial owner"** without checking `depth_capped`.
3. **Cite.** Each material claim gets its source URL from the dossier.
4. **Say which jurisdiction tier you were working in.** It changes what silence means.
5. **Absence of an edge means "not yet observed", not "does not exist".**
6. Sanctions and risk scores are **investigative leads, not determinations**. SnitchScore is a
   0–100 heuristic. Verify a cluster-only hit against the sibling record before you name anyone.

## Worked shape

> **Who ultimately owns Acme Holdings Ltd (UK)?**
>
> 1. `resolve { queries: ["gb-coh:01234567"] }` → id (exact, identifier match).
> 2. `list_jurisdictions` → GB is `deep` / `full` / `ownership` — absence here is meaningful.
> 3. `trace_ownership_path` → 3 hops; returned `max_depth: 3`, `depth_capped: false` → the top of
>    the chain is genuinely the top.
> 4. `get_sanctions` on each hop → one `crime` signal via cluster on hop 2 → flag as a lead.
> 5. `get_dossier` on the ultimate owner → cite the PSC record URL.
>
> **Answer:** named person at hop 3, via two UK holding companies, PSC-declared, sources cited;
> plus a cluster-only adverse-media lead on hop 2 marked for verification.

## When the honest answer is "buy the record"

For an `on_demand` jurisdiction (China, most secrecy havens, closed registries) the corpus holds
only the leak/sanctions subset. Say so plainly, and note the record can be procured — do not
present a subset search as a full-registry check.
