#!/usr/bin/env node
/**
 * WhiteIntel MCP server — corporate & offshore ownership intelligence.
 *
 * Exposes WhiteIntel's public REST API (https://whiteintel.dev/api/public/*) as
 * Model Context Protocol tools: resolve UK companies into ownership graphs,
 * search the corpus of companies and people, and trace ownership chains to the
 * ultimate beneficial owner.
 *
 * Data: ~116.2M entities fused across 29 public/semi-public registries — OpenOwnership,
 * GLEIF, ICIJ Offshore Leaks, SEC EDGAR, Cyprus DRCOR, sanctions/PEP lists and more —
 * cross-source resolved onto one cited identity spine, plus live UK Companies House
 * lookups. Entity count read from /api/public/stats on 2026-08-11 (116,163,032, itself a
 * planner estimate); the live figure is always at whiteintel.dev/api/public/stats, whose
 * source map is rebuilt by counting registries — new sources appear there on their own.
 *
 * Freemium. Without a key, calls hit the anonymous free tier. Set WHITEINTEL_API_KEY
 * (a wi_… key from whiteintel.dev → Settings → API keys) to authenticate as your
 * plan and lift free-tier limits — it's forwarded as a Bearer token.
 *
 * Agents can pay: get_pricing → buy_dossier (guest Stripe Checkout, no account) →
 * claim_dossier (mints a 90-day entity-scoped token) → get_dossier with `token`
 * unlocks the paid depth (full UBO chain + financial history; premium adds
 * itemised assets). Stdio transport.
 * Add to an MCP client (Claude Desktop, Cursor) with:
 *   { "command": "npx", "args": ["-y", "@whiteintel/mcp-server"],
 *     "env": { "WHITEINTEL_API_KEY": "wi_…" } }   // env optional (free tier without it)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { resolveBase, qs } from "./lib.js";

const REQUEST_TIMEOUT_MS = Number(process.env.WHITEINTEL_TIMEOUT_MS) || 30_000;
const API_BASE = resolveBase(process.env.WHITEINTEL_API_BASE);
// Optional wi_ API key — when present, forwarded as a Bearer token so the caller is
// authenticated as their plan and metered per-key (instead of the anonymous tier).
const API_KEY = (process.env.WHITEINTEL_API_KEY || "").trim();

async function apiGet(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const headers = { accept: "application/json", "user-agent": "whiteintel-mcp-server" };
  if (API_KEY) headers.authorization = `Bearer ${API_KEY}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(
      e?.name === "AbortError"
        ? `request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : `network error: ${e?.message ?? e}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    console.error(`whiteintel-mcp-server: upstream ${res.status} for ${path}`);
    const detail = body && typeof body === "object" ? (body.error || body.detail || body.message) : null;
    // Only 5xx / 429 are worth retrying — surface the actionable reason for the rest
    // (400 bad request, 404 not found, 429 quota) so the agent doesn't blindly retry.
    if (res.status >= 500 || res.status === 429) {
      const ra = res.headers.get("retry-after");
      throw new Error(
        `The WhiteIntel API is temporarily unavailable (${res.status}${detail ? `: ${detail}` : ""}).` +
          (ra ? ` Retry after ${ra}s.` : " Please retry shortly."),
      );
    }
    throw new Error(`The WhiteIntel API rejected the request (${res.status}${detail ? `: ${detail}` : ""}).`);
  }
  return body;
}

async function apiPost(path, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const headers = { accept: "application/json", "content-type": "application/json", "user-agent": "whiteintel-mcp-server" };
  if (API_KEY) headers.authorization = `Bearer ${API_KEY}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: JSON.stringify(payload), signal: ctrl.signal });
  } catch (e) {
    throw new Error(e?.name === "AbortError" ? `request timed out after ${REQUEST_TIMEOUT_MS}ms` : `network error: ${e?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const detail = body && typeof body === "object" ? (body.error || body.detail || body.message) : null;
    if (res.status >= 500 || res.status === 429) {
      const ra = res.headers.get("retry-after");
      throw new Error(`The WhiteIntel API is temporarily unavailable (${res.status}${detail ? `: ${detail}` : ""}).` + (ra ? ` Retry after ${ra}s.` : " Please retry shortly."));
    }
    throw new Error(`The WhiteIntel API rejected the request (${res.status}${detail ? `: ${detail}` : ""}).`);
  }
  return body;
}

// ── One-off dossier checkout (the agent-payment path) ─────────────────────────
// buy_dossier / claim_dossier talk straight to the public `dossier-checkout`
// Supabase Edge Function — guest checkout, no WhiteIntel account needed (Stripe
// collects an email for delivery). The apikey below is the same PUBLIC anon
// (publishable) key the whiteintel.dev web app ships to every browser; it grants
// nothing by itself — payment authenticity is Stripe-side, inside the function.
const CHECKOUT_URL = "https://azmnkvjnelbdjnmukxll.supabase.co/functions/v1/dossier-checkout";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6bW5rdmpuZWxiZGpubXVreGxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NzQzNjcsImV4cCI6MjA5NzQ1MDM2N30.36Qo7y8BKY2WUk829eZUE9kS_1daaG8p-pDo8Q4kPtk";

async function checkoutPost(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const headers = { accept: "application/json", "content-type": "application/json", apikey: SUPABASE_ANON_KEY, "user-agent": "whiteintel-mcp-server" };
  let res;
  try {
    res = await fetch(CHECKOUT_URL, { method: "POST", headers, body: JSON.stringify(payload), signal: ctrl.signal });
  } catch (e) {
    throw new Error(e?.name === "AbortError" ? `request timed out after ${REQUEST_TIMEOUT_MS}ms` : `network error: ${e?.message ?? e}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    // `message` first: when the service sends prose it is the actionable half. 422
    // insufficient_data, for instance, carries "no ownership links, company details or
    // financials on file" — an agent can act on that (pick another entity) where the bare
    // error code just looks like a fault. Falls back to the code when there is no prose.
    const detail = body && typeof body === "object" ? (body.message || body.error || body.detail) : null;
    if (res.status >= 500 || res.status === 429) {
      const ra = res.headers.get("retry-after");
      throw new Error(`The WhiteIntel checkout service is temporarily unavailable (${res.status}${detail ? `: ${detail}` : ""}).` + (ra ? ` Retry after ${ra}s.` : " Please retry shortly."));
    }
    // 402 not_paid is the expected pre-payment claim answer — surface it verbatim
    // so the agent knows to wait for the human to finish Checkout, not to retry blindly.
    throw new Error(`The WhiteIntel checkout service rejected the request (${res.status}${detail ? `: ${detail}` : ""}).`);
  }
  return body;
}

// Static, honest price list — mirrors whiteintel.dev/pricing (the single source of
// truth for advertised figures). No network call; safe to invoke any time.
const PRICING = {
  currency: "EUR",
  pricing_url: "https://whiteintel.dev/pricing",
  one_off_dossiers: {
    standard: {
      price: "€39",
      unlocks:
        "Full multi-hop UBO chain + year-over-year financial history for ONE entity (the free tier shows the first ownership hop and the latest financial period only).",
    },
    premium: {
      price: "€99",
      unlocks:
        "Everything in Standard, plus the itemised asset layer held via the ownership graph — vessels, aircraft, securities, real estate.",
    },
    packs: {
      "standard × 5": "€159 total",
      "standard × 25": "€599 total",
      "premium × 5": "€399 total",
      note: "A pack grants report credits redeemable on any entity; there is no premium 25-pack.",
    },
    token_validity: "Each claimed access token is scoped to one entity and stays valid for 90 days.",
  },
  subscriptions: {
    investigator: {
      price: "€149/seat·mo",
      includes:
        "Unlimited full-depth ownership graph + unlimited Premium dossiers, risk scores + watchlists, metered API/MCP credit allowance.",
    },
    business: {
      price: "€1,900/mo",
      includes:
        "Everything in Investigator with 3 seats, unlimited Premium dossiers, monitoring + webhooks, larger API/MCP credit allowance.",
    },
    note:
      "Subscriptions are bought at whiteintel.dev/pricing (account required); the wi_ API key from Settings then lifts this MCP server's limits via WHITEINTEL_API_KEY.",
  },
  api: {
    metered: "Pay-as-you-go API from €0.20/call, tapering to €0.12 and €0.08/call at volume.",
  },
  how_an_agent_buys: [
    "1. Call buy_dossier { tier, pack?, entity_id?, entity_name? } → returns a Stripe checkout_url.",
    "2. Open the checkout_url so a human (or a payment-capable agent) completes payment — no WhiteIntel account needed; Stripe collects an email for delivery.",
    "3. After payment Stripe redirects to whiteintel.dev with ?session_id=cs_… — call claim_dossier { session_id } to mint the access token (idempotent, safe to retry).",
    "4. Pass the token to get_dossier { id, token } for the unlocked dossier JSON.",
  ],
};

const TOOLS = [
  {
    name: "lookup_company",
    description:
      "Look up a UK company by its Companies House registration number and return the company record plus a ready-built ownership graph (officers, persons of significant control, parent/subsidiary edges). Pass the number verbatim — do not strip leading zeros (e.g. 09446231, SC123456).",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "string", maxLength: 20, description: "UK Companies House registration number." },
      },
      required: ["number"],
    },
    handler: (a) => apiGet(`/api/public/company/${encodeURIComponent(String(a.number).trim())}`),
  },
  {
    name: "search_companies",
    description:
      "Free-text company-name search against UK Companies House. Use this to resolve a company NAME into the registration number that lookup_company needs.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", maxLength: 200, description: "Company name or fragment." },
        limit: { type: "number", minimum: 1, maximum: 50, description: "Max results (default 8)." },
      },
      required: ["q"],
    },
    handler: (a) => apiGet(`/api/public/company/search${qs({ q: a.q, limit: a.limit ?? 8 })}`),
  },
  {
    name: "search_entities",
    description:
      "Search every node in the live WhiteIntel corpus — companies AND people — by name, across all fused sources. This is the lexical search and it always covers the FULL corpus, so it is the fallback whenever semantic_search comes back thin. Returns entity ids you then pass to get_entity or trace_ownership_path. Each hit's `source` says whether it came from the resolved corpus or a live registry passthrough — it does NOT name the originating registry; for that provenance call get_entity (registry_profile) or get_dossier, which cite per-record source URLs. Use `juris` to scope to a country (e.g. gb, ky, us, cy).",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", maxLength: 200, description: "Entity name or fragment." },
        limit: { type: "number", minimum: 1, maximum: 50, description: "Max results (default 20)." },
        type: { type: "string", enum: ["company", "person", "asset"], description: "Optional: filter by entity kind." },
        juris: { type: "string", maxLength: 8, description: "Optional: filter by jurisdiction code (e.g. gb, ky, us)." },
        risk: { type: "string", enum: ["HIGH", "MED", "LOW"], description: "Optional: filter by risk level." },
      },
      required: ["q"],
    },
    handler: (a) => apiGet(`/api/public/entity/search${qs({ q: a.q, limit: a.limit ?? 20, type: a.type, juris: a.juris, risk: a.risk })}`),
  },
  {
    name: "get_entity",
    description:
      "Full record for one entity by id: type (company/person), identifiers, jurisdiction, risk level, summary and its direct relationships with provenance. Get the id from search_entities or lookup_company.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 80, description: "Entity id." },
      },
      required: ["id"],
    },
    handler: (a) => apiGet(`/api/public/entity/${encodeURIComponent(String(a.id).trim())}`),
  },
  {
    name: "get_dossier",
    description:
      "Build a structured, fully-cited intelligence dossier for one entity by id: identity with cross-source linked records (the same real-world entity resolved across ICIJ leaks, GLEIF, registries), ownership/control (direct owners, holdings, and the UBO chain), risk signals, and provenance on every layer. Every claim traces to a source URL. Use this for 'tell me everything about X'. Get the id from search_entities. Free tier shows the first ownership hop + latest financials; pass a one-off purchase `token` (from claim_dossier, see get_pricing / buy_dossier) or set WHITEINTEL_API_KEY to unlock the full depth.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 80, description: "Entity id (from search_entities)." },
        token: { type: "string", maxLength: 200, description: "Optional one-off dossier access token (from claim_dossier or the delivery email). A standard token unlocks the full UBO chain + financial history for this entity; a premium token additionally unlocks itemised assets." },
      },
      required: ["id"],
    },
    handler: (a) => apiGet(`/api/public/dossier/${encodeURIComponent(String(a.id).trim())}${qs({ token: a.token })}`),
  },
  {
    name: "trace_ownership_path",
    description:
      "Walk the ownership graph upward from a root entity, up to max_depth hops, and return the ordered chain(s) connecting it to the ultimate beneficial owner. Use this to answer 'who ultimately controls X?'. Get the root id from search_entities.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", maxLength: 80, description: "Root entity id to trace from." },
        max_depth: { type: "number", minimum: 1, maximum: 10, description: "Max hops to walk (default 6)." },
      },
      required: ["root"],
    },
    handler: (a) => apiGet(`/api/public/ownership-path${qs({ root: a.root, max_depth: a.max_depth ?? 6 })}`),
  },
  // ── bounded graph walk (S13·P3, LINEAR-4806; DB migration 0295) ───────────────
  // Every bound is a CONSTANT inside the Postgres function, not a parameter of these
  // tools. An agent can ask for less; there is no argument that asks for more. This is
  // the direct lesson of /api/public/similar, which once consumed 3.8 GB on a single
  // call and returned 503 because its cost was a function of the data, not of the
  // contract. The descriptions state the bounds because an agent that reads
  // `found: false` as "not connected" will write that sentence into a due-diligence
  // report — and a bounded search has not earned that sentence.
  {
    name: "graph_neighbourhood",
    description:
      "Return every ownership/control edge within a bounded number of hops of one entity, in BOTH directions: who it controls, who controls it, and their neighbours. Use it to answer 'what sits around this company?' — the wider view that trace_ownership_path (upward only) does not give. Hard-capped in the database: depth 3, 300 edges, and at most 25 edges followed per entity per direction per hop. If the edge budget is exhausted the response sets `truncated: true` with a plain-language note; that is NORMAL for hub entities (the corpus holds single nodes with more than 22,000 edges) and means the picture is partial, not wrong. Each edge carries `origin`: 'registry' (observed in a source registry) or 'derived'/'curated'/'asserted' (inferred by WhiteIntel). Get the root id from search_entities or resolve.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", maxLength: 80, description: "Root entity uuid." },
        depth: { type: "number", minimum: 1, maximum: 3, description: "Hops to walk (default 2). Also capped by your plan." },
        edges: { type: "number", minimum: 10, maximum: 300, description: "Edge budget (default 120). Lower it for a legible picture, raise it for completeness." },
      },
      required: ["root"],
    },
    handler: (a) => apiGet(`/api/public/graph/neighbourhood${qs({ root: a.root, depth: a.depth ?? 2, edges: a.edges ?? 120 })}`),
  },
  {
    name: "graph_path",
    description:
      "Find how two entities are connected: a bounded breadth-first search over ownership and control edges in both directions, returning the ordered hops from one to the other. WARNING, AND IT CHANGES HOW YOU MUST REPORT THE RESULT: this search is BOUNDED, NOT EXHAUSTIVE. At most 15 edges are followed per entity, per direction, per hop, so a genuine connection running through a heavily-connected intermediary can be missed. `found: false` means NO PATH WAS FOUND WITHIN THOSE BOUNDS — it is NOT evidence that the two entities are unconnected, and must never be reported as a clean result. The response always carries `exhaustive: false` and a `bounds_note` restating this.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", maxLength: 80, description: "Start entity uuid." },
        to: { type: "string", maxLength: 80, description: "End entity uuid." },
        max_depth: { type: "number", minimum: 1, maximum: 4, description: "Max hops (default 3). Depth 4 is measurably slower on densely connected entities — request it deliberately." },
      },
      required: ["from", "to"],
    },
    handler: (a) => apiGet(`/api/public/graph/path${qs({ from: a.from, to: a.to, max_depth: a.max_depth ?? 3 })}`),
  },
  {
    name: "lookup_by_identifier",
    description:
      "Resolve an entity by a strong external identifier instead of a name — a LEI, OFAC SDN uid, EU/UN/UK sanctions id, Singapore UEN, SEC CIK, Polish KRS, UK Companies House number, French SIREN, or Brazil RFB CNPJ. Returns the single resolved entity (id, type, jurisdiction, identifier, risk) so you can pivot into get_entity / get_dossier / get_sanctions. Use this when you already hold a registry id and want the corpus node behind it. NOT every identifier you may see in a response is resolvable here — the enum below is the complete accepted set and the route hard-rejects anything else with a 400. In particular Cyprus records carry a `cy-reg:` identifier that this tool does NOT accept: reach Cypriot companies with search_entities using juris='cy'.",
    // LINEAR-5147: `nip` removed — no Polish NIP is stamped onto entities.identifier today
    // (they live only in props->>'nip' on `krs:` rows), so the scheme resolved to nothing.
    // Keep this enum aligned with app IDENTIFIER_SCHEMES; the server-side by-identifier
    // route hard-rejects unknown schemes.
    inputSchema: {
      type: "object",
      properties: {
        scheme: {
          type: "string",
          enum: ["lei", "ofac", "eu", "un", "uk", "uen", "sec", "krs", "gb-coh", "siren", "br-cnpj"],
          description: "Identifier scheme: lei | ofac | eu | un | uk | uen | sec | krs | gb-coh | siren (French SIREN, 9 digits) | br-cnpj (Brazil RFB CNPJ; accepts 8-digit root or full 14-digit form 12.345.678/0001-95).",
        },
        value: { type: "string", maxLength: 100, description: "The identifier value (e.g. an LEI, an OFAC SDN uid, a Companies House number)." },
      },
      required: ["scheme", "value"],
    },
    handler: (a) => apiGet(`/api/public/by-identifier${qs({ scheme: a.scheme, value: a.value })}`),
  },
  {
    name: "get_sanctions",
    description:
      "Return an entity's sanctions exposure: every 'sanctioned' risk signal (OFAC SDN, EU, UN, UK lists) for the entity AND its resolved cluster siblings — each with the list, regime, source list and a source URL. Response splits the top-level flag: `sanctioned_self` = a direct listing ON this entity; `sanctioned_via_cluster` = the flag reaches it ONLY via a cross-source cluster sibling (~2.3% false-positive tail on UK OpenOwnership resolution — treat cluster-only hits as a lead until you verify the sibling really is the same real-world party). The aggregate `sanctioned` (self OR cluster) is preserved for back-compat. Get the id from search_entities or lookup_by_identifier.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 80, description: "Entity id." },
      },
      required: ["id"],
    },
    handler: (a) => apiGet(`/api/public/sanctions/${encodeURIComponent(String(a.id).trim())}`),
  },
  {
    name: "check_offshore_exposure",
    description:
      "Walk the ownership chain upward from an entity and flag, hop by hop, whether each node is sanctioned and/or sits in a secrecy jurisdiction (classic tax-haven / offshore-secrecy country). Returns the chain, the flagged hops, and a structured 4-state `verdict` — BRANCH ON `verdict`, NOT on `exposed`. States: `no_ownership_data` (we hold zero ownership edges from this entity — NOT a clean verdict, exposure cannot be evaluated), `flagged` (a sanctioned or secrecy-jurisdiction hit sits on the walked chain), `checked_to_max_depth_truncated` (walk reached the depth cap with more chain above — a flagged owner may still sit higher, NOT clean), `checked_full_clean` (walked the full chain, no flag). Also returns `depth_walked` (how deep the walk actually reached) and `depth_capped` (true when the plan or `max_depth` shortened the walk — anonymous keys always walk at most 2 hops). Legacy `exposed` boolean is retained but is only meaningful when `verdict='flagged'`. Get the id from search_entities or lookup_by_identifier.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 80, description: "Entity id to assess." },
        max_depth: { type: "number", minimum: 1, maximum: 6, description: "Max ownership hops to walk (default 6)." },
      },
      required: ["id"],
    },
    handler: (a) => apiGet(`/api/public/offshore-exposure/${encodeURIComponent(String(a.id).trim())}${qs({ max_depth: a.max_depth ?? 6 })}`),
  },
  {
    name: "get_company_details",
    description:
      "Companies House register detail for a UK company by entity id: registered address, status, company type, incorporation date, SIC industry codes, and the filing/compliance layer — accounts type, last-filed and next-due dates (flagged when OVERDUE), confirmation-statement status, outstanding mortgage charges, and former ('also known as') names. Use this for 'where is X registered / what does it file / is it overdue / what was it called before'. Get the id from search_entities or lookup_by_identifier.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", maxLength: 80, description: "Entity id (a UK company)." } },
      required: ["id"],
    },
    handler: (a) => apiGet(`/api/public/company-details/${encodeURIComponent(String(a.id).trim())}`),
  },
  {
    name: "get_financials",
    description:
      "Filed financial figures for a UK company by entity id, year-over-year, from Companies House iXBRL accounts: turnover, profit/(loss), net assets, cash, shareholder funds, fixed/current assets, and employee count per reporting period. Use this for 'what are X's revenue / profit / net assets / how many employees'. Coverage is uneven — balance-sheet items and employees are broad, but turnover/profit are sparse because micro-entities file no profit-and-loss account. Get the id from search_entities.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", maxLength: 80, description: "Entity id (a UK company)." } },
      required: ["id"],
    },
    handler: (a) => apiGet(`/api/public/financials/${encodeURIComponent(String(a.id).trim())}`),
  },
  {
    name: "get_pulse",
    description:
      "The WhiteIntel Pulse activity feed: recent ownership / control changes across the corpus, newest first, each with a source registry. Use this to answer 'what changed recently / any recent ownership movements' or to monitor the corpus. The default (unfiltered) feed returns every kind, newest first — it is NOT ownership-only, so filter by `kind` if you want one stream. Four kinds are live and all four are cited (a source URL on effectively every row, measured 2026-08-11).",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["ownership", "filing", "watchlist", "sanction"], description: "Optional: filter by event kind. `ownership` = registry-recorded control changes (GLEIF). `filing` = UK Companies House accounts. `watchlist` = OpenSanctions listings — politically-exposed persons, criminal/wanted entries and procurement debarments, not PEPs alone. `sanction` = a designation landing on a sanctions list (e.g. OFAC SDN). All four carry source URLs and all four appear in the default feed." },
        limit: { type: "number", minimum: 1, maximum: 100, description: "Max events (default 40)." },
        since: { type: "string", description: "Optional sync cursor (ISO-8601): pass the next_since from your last response to get only events ingested after it — poll this to monitor what's new." },
      },
    },
    handler: (a) => apiGet(`/api/public/pulse${qs({ kind: a.kind, limit: a.limit ?? 40, since: a.since })}`),
  },
  {
    name: "resolve",
    description:
      // SCHEME LIST — KEEP IT IDENTICAL TO lookup_by_identifier's enum ABOVE AND TO app
      // IDENTIFIER_SCHEMES (intel.server.ts). This string drifted in BOTH directions and an
      // agent has no way to find that out except by getting nothing back:
      //   · it advertised `nip`, which LINEAR-5147 removed everywhere else — no Polish NIP is
      //     stamped on entities.identifier, so `nip:…` resolved to zero rows, silently.
      //   · it omitted `br-cnpj`, which IS supported and reaches our LARGEST source (Brazil RFB,
      //     65.2M rows measured 2026-08-11) — the one scheme most worth telling an agent about.
      "Batch-resolve a list of company names or strong identifiers (scheme:value — lei, siren, gb-coh, uen, br-cnpj, sec, ofac, eu, un, uk, krs) to canonical WhiteIntel entity ids in ONE call. Each result carries a confidence: 'exact' (identifier match) or 'name' (top name hit). Use this to enrich a whole list — suppliers, counterparties, a portfolio — without one lookup per row. Then feed the ids into get_dossier / trace_ownership_path / get_sanctions. Up to 25 items anonymously, 100 with WHITEINTEL_API_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: { type: "string" },
          description: "Names or scheme:value identifiers, e.g. [\"Tesco\", \"siren:552081317\", \"lei:213800...\", \"gb-coh:00445790\"].",
        },
      },
      required: ["queries"],
    },
    handler: (a) => apiPost(`/api/public/resolve`, { queries: Array.isArray(a.queries) ? a.queries : [] }),
  },
  // ── The agent-payment path: get_pricing → buy_dossier → claim_dossier → get_dossier(token) ──
  {
    name: "get_pricing",
    description:
      "WhiteIntel's price list plus the exact machine flow for buying access. One-off cited dossiers (Standard €39: full UBO chain + financial history · Premium €99: additionally itemised assets), bulk packs (5× / 25× at a discount), subscriptions (Investigator €149/seat·mo, Business €1,900/mo) and the metered API. Returns how_an_agent_buys — buy_dossier opens a Stripe Checkout, a human (or payment-capable agent) pays, claim_dossier mints the access token, and get_dossier with that token returns the unlocked report. Static data, no network call — check it before recommending a purchase.",
    inputSchema: { type: "object", properties: {} },
    handler: () => PRICING,
  },
  {
    name: "buy_dossier",
    description:
      "Start a one-off dossier purchase via guest Stripe Checkout — no WhiteIntel account needed (Stripe collects an email for delivery). Pick a tier ('standard' €39: full UBO chain + financial history · 'premium' €99: additionally itemised assets — vessels, aircraft, securities, real estate) and optionally a bulk pack ('5' or '25' report credits; standard 5×€159 / 25×€599, premium 5×€399 — no premium 25-pack) plus the entity_id (from search_entities) the report is for. Returns checkout_url + next_steps: open the URL so payment can be completed, then feed the session_id from the post-payment redirect to claim_dossier for the access token. See get_pricing for the full price list.",
    inputSchema: {
      type: "object",
      properties: {
        tier: { type: "string", enum: ["standard", "premium"], description: "Dossier tier: standard (€39) or premium (€99, adds itemised assets)." },
        pack: { type: "string", enum: ["single", "5", "25"], description: "Optional bulk pack (default single). standard: 5=€159 / 25=€599 · premium: 5=€399 (no 25-pack)." },
        entity_id: { type: "string", maxLength: 80, description: "Optional entity id (from search_entities) the dossier should unlock." },
        entity_name: { type: "string", maxLength: 200, description: "Optional entity display name, recorded on the Stripe session as an audit trace only — it is NOT displayed anywhere. Since 2026-08-09 the name shown on the invoice and in the delivery email is read from WhiteIntel's own record for entity_id (caller-supplied text is never rendered in mail we send), and the Checkout page shows the Stripe product name. Safe to omit." },
      },
      required: ["tier"],
    },
    handler: async (a) => {
      const tier = String(a.tier).trim();
      const pack = String(a.pack ?? "single").trim();
      if (tier === "premium" && pack === "25") {
        throw new Error("The premium tier has no 25-pack — choose pack 'single' or '5' (see get_pricing).");
      }
      const body = await checkoutPost({
        action: "create",
        tier,
        pack,
        ...(a.entity_id ? { entity_id: String(a.entity_id).trim() } : {}),
        ...(a.entity_name ? { entity_name: String(a.entity_name).trim() } : {}),
      });
      return {
        checkout_url: body?.url ?? null,
        next_steps: [
          "Open checkout_url and complete the Stripe payment (a human can do this — no WhiteIntel account is required).",
          "After payment Stripe redirects to whiteintel.dev with ?session_id=cs_… in the URL.",
          "Call claim_dossier with that session_id to mint the entity-scoped access token (idempotent — safe to call again).",
          "Pass the token to get_dossier { id, token } for the unlocked dossier JSON. The token is also emailed as a magic link and stays valid for 90 days.",
        ],
      };
    },
  },
  {
    name: "claim_dossier",
    description:
      "Redeem a paid Stripe Checkout session for a dossier access token. Pass the session_id (cs_…) from the post-payment redirect after buy_dossier. Returns { token, entity_id, tier } — pass the token to get_dossier as its `token` input for the unlocked report (standard: full UBO chain + financial history · premium: additionally itemised assets). Idempotent: claiming the same session again returns the same grant, so it is safe to retry. Fails with 402 not_paid until the payment has actually completed — wait for the human to finish Checkout, then call again.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", maxLength: 200, description: "Stripe Checkout session id (cs_…) from the success redirect." },
      },
      required: ["session_id"],
    },
    handler: async (a) => {
      const body = await checkoutPost({ action: "claim", session_id: String(a.session_id).trim() });
      return {
        ...body,
        note: "Pass this token to get_dossier { id: entity_id, token } for the unlocked dossier JSON. Keep it private — it unlocks the paid report and stays valid for 90 days.",
      };
    },
  },
  // ── Corpus-RAG: semantic (meaning-based) retrieval over the resolved dossier cards ──
  {
    name: "semantic_search",
    description:
      "Meaning-based entity search over the corpus (BGE-M3 vector ANN over the resolved dossier cards). Finds companies and people whose profile is semantically closest to a natural-language query — a description, a role, a risk pattern — even when no keyword matches. Optional kind (Company/Person/Asset) and jurisdiction (ISO code) filters. Returns entity_id, caption, kind, jurisdiction, risk and a similarity score; feed entity_id into get_dossier / trace_ownership_path. PARTIAL COVERAGE — only a small share of the corpus is currently embedded (the backfill is running); a thin or empty result is not proof the corpus is empty, so ALWAYS pair this with search_entities as a lexical fallback before concluding an entity is unknown.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", maxLength: 500, description: "Natural-language search, e.g. 'sanctioned Russian aluminium holding company'." },
        k: { type: "number", minimum: 1, maximum: 50, description: "Max hits (default 10)." },
        kind: { type: "string", description: "Optional entity-kind filter (Company / Person / Asset / …)." },
        jurisdiction: { type: "string", description: "Optional ISO jurisdiction filter (e.g. GB, RU)." },
      },
      required: ["query"],
    },
    handler: (a) => apiGet(`/api/public/semantic-search${qs({ q: a.query, k: a.k ?? 10, kind: a.kind, juris: a.jurisdiction })}`),
  },
  {
    name: "find_similar",
    description:
      // The "TEMPORARILY UNAVAILABLE … returns 503 for every entity" sentence that used to sit here
      // was true when the ANN index was dropped, and false by the time anyone read it: the index was
      // rebuilt as IVFFlat and measured healthy (valid, 7.7 GB over 985,708 chunks, 2026-08-10). It
      // shipped on npm for weeks telling every installing agent not to bother calling this tool.
      // The real limit is coverage, not availability, and it is stated the same way here as on the
      // hosted /api/mcp so the two agent surfaces cannot disagree about what works.
      "Entities most similar to a given one — the nearest corpus dossier cards ('more like this'), for peer discovery and clustering around a known entity. Pass an entity_id from search_entities. Returns entity_id, caption, kind, jurisdiction, risk and a similarity score. COVERAGE IS PARTIAL — only entities in the embedded risk-scored subset (~1.9% of the corpus and growing) have peers; an entity outside it returns an empty list, not an error. Fall back to semantic_search or search_entities for the rest.",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: { type: "string", maxLength: 80, description: "Entity uuid from search_entities." },
        k: { type: "number", minimum: 1, maximum: 50, description: "Max hits (default 10)." },
      },
      required: ["entity_id"],
    },
    handler: (a) => apiGet(`/api/public/similar/${encodeURIComponent(String(a.entity_id).trim())}${qs({ k: a.k ?? 10 })}`),
  },
];

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

const server = new Server(
  // Keep in lockstep with package.json / server.json / claude-plugin.json — this is the
  // version the client actually sees over the wire, and it silently drifted 0.7.0 vs 0.7.1.
  { name: "whiteintel-mcp-server", version: "0.7.3" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOL_BY_NAME[req.params.name];
  if (!tool) {
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }] };
  }
  try {
    const result = await tool.handler(req.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { isError: true, content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }] };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs (stdout is the MCP transport).
  console.error(`whiteintel-mcp-server running on stdio · ${TOOLS.length} tools · API ${API_BASE} · ${API_KEY ? "keyed" : "anonymous (free tier)"}`);
}

main().catch((err) => {
  console.error("whiteintel-mcp-server fatal:", err);
  process.exit(1);
});
