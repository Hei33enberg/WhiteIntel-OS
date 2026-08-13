// Network-free consistency guard for the release manifests.
//
// The version string is written in SIX machine-readable slots and the tool count is written in
// THREE human-facing descriptions. smoke.mjs only checks two of the version slots (index.js
// serverInfo vs package.json) and the wire tool list — it says nothing about claude-plugin.json,
// server.json (x2) or package-lock.json (x2), which is exactly how 0.7.0 shipped to npm with the
// hosted surface on 0.7.3 and nobody noticed. This test asserts, from local files only, that every
// version slot equals package.json and every "N tools" claim equals the length of the tool list
// smoke.mjs already guards over the wire. A bump that touches one file and forgets another fails CI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const readJson = (rel) => JSON.parse(read(rel));

const pkg = readJson("../package.json");
const VERSION = pkg.version;

test("version is identical across every manifest slot", () => {
  // Source of truth is package.json. Every other slot must equal it exactly.
  const lock = readJson("../package-lock.json");
  const plugin = readJson("../claude-plugin.json");
  const server = readJson("../server.json");

  const slots = {
    "package-lock.json .version": lock.version,
    'package-lock.json .packages[""].version': lock.packages?.[""]?.version,
    "claude-plugin.json .version": plugin.version,
    "server.json .version_detail.version": server.version_detail?.version,
    "server.json .packages[0].version": server.packages?.[0]?.version,
  };

  // index.js declares the version the client sees over the wire as a plain object literal.
  const index = read("../index.js");
  const m = index.match(/name:\s*"whiteintel-mcp-server",\s*version:\s*"([^"]+)"/);
  assert.ok(m, "could not find the serverInfo { name, version } literal in index.js");
  slots["index.js serverInfo.version"] = m[1];

  for (const [where, value] of Object.entries(slots)) {
    assert.equal(
      value,
      VERSION,
      `${where} is ${JSON.stringify(value)} but package.json says ${JSON.stringify(VERSION)} — version drifted.`,
    );
  }
});

test('every "N tools" claim matches the tool count smoke.mjs guards', () => {
  // Single source of truth for the count: the EXPECTED_TOOLS list smoke.mjs asserts over the wire.
  const smoke = read("../test/smoke.mjs");
  const block = smoke.match(/const EXPECTED_TOOLS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(block, "could not find the EXPECTED_TOOLS array in test/smoke.mjs");
  const toolCount = (block[1].match(/"[^"]+"/g) ?? []).length;
  assert.ok(toolCount > 0, "EXPECTED_TOOLS parsed as empty");

  // Files that advertise the count in prose. Each may state it more than once (README does).
  const sources = {
    "claude-plugin.json": readJson("../claude-plugin.json").description,
    "server.json": readJson("../server.json").description,
    "README.md": read("../README.md"),
  };

  for (const [where, textRaw] of Object.entries(sources)) {
    const text = String(textRaw);
    const claims = [...text.matchAll(/(\d+)\s+tools\b/g)].map((x) => Number(x[1]));
    assert.ok(claims.length > 0, `${where} makes no "N tools" claim — expected at least one mentioning ${toolCount}`);
    for (const claim of claims) {
      assert.equal(
        claim,
        toolCount,
        `${where} advertises ${claim} tools but smoke.mjs guards ${toolCount} — count drifted.`,
      );
    }
  }
});

test("resolve's advertised scheme list matches lookup_by_identifier's enum", () => {
  // Two tools declare the SAME set of identifier schemes in two shapes:
  //   · lookup_by_identifier carries them as a machine-readable JSON `enum` (source of truth).
  //   · resolve only names them in prose, inside "(scheme:value — …)".
  // This pair has drifted in BOTH directions before (nip advertised after removal → zero rows;
  // br-cnpj, the scheme reaching the largest source, omitted). The wire smoke test cannot catch
  // it because both strings stay non-empty and well-formed; only content parity catches it.
  const src = read("../index.js");

  const lbi = src.slice(
    src.indexOf('name: "lookup_by_identifier"'),
    src.indexOf('name: "get_sanctions"'),
  );
  const enumMatch = lbi.match(/enum:\s*\[([^\]]*)\]/);
  assert.ok(enumMatch, "could not find lookup_by_identifier's scheme enum in index.js");
  const enumSchemes = (enumMatch[1].match(/"([^"]+)"/g) ?? []).map((s) => s.replace(/"/g, ""));
  assert.ok(enumSchemes.length > 0, "lookup_by_identifier enum parsed as empty");

  const resolve = src.slice(
    src.indexOf('name: "resolve"'),
    src.indexOf('name: "get_pricing"'),
  );
  const proseMatch = resolve.match(/scheme:value\s*[—-]\s*([^)]*)\)/);
  assert.ok(proseMatch, "could not find resolve's '(scheme:value — …)' list in index.js");
  const proseSchemes = proseMatch[1].split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  assert.ok(proseSchemes.length > 0, "resolve prose scheme list parsed as empty");

  const enumSet = new Set(enumSchemes);
  const proseSet = new Set(proseSchemes);
  const onlyEnum = [...enumSet].filter((s) => !proseSet.has(s));
  const onlyProse = [...proseSet].filter((s) => !enumSet.has(s));
  assert.deepEqual(
    { onlyEnum, onlyProse },
    { onlyEnum: [], onlyProse: [] },
    `resolve's scheme prose and lookup_by_identifier's enum disagree — onlyEnum=${JSON.stringify(onlyEnum)} onlyProse=${JSON.stringify(onlyProse)}. Align the resolve description and the enum in index.js.`,
  );
});

test("every corpus figure (entity total + source count) is identical across all manifests", () => {
  // Two numbers agents read — "~118.0M entities" and "31 registries/sources" — are hand-copied into
  // several slots each: server.json, claude-plugin.json, README.md (a %20-encoded shields badge + two
  // prose lines) and index.js's header comment. A data refresh bumps whiteintel.dev/api/public/stats
  // and someone edits server.json + the README prose but forgets the badge (the digit is URL-encoded
  // and easy to miss) or index.js — and the pack ships advertising two different corpus sizes,
  // silently, exactly the way 0.7.0 shipped a stale count. This is the tool-count guard applied to
  // the other two figures. No file is a source of truth for these, so the invariant is pure internal
  // consistency: every occurrence must equal every other. Network-free — the live count is
  // authoritative over the repo, but the repo must at least agree with itself.
  // llms-install.md was NOT in this list until 2026-08-13, and that omission is exactly why it
  // was the one file still advertising ~118.0M / ~20.6M after every other slot had been refreshed.
  // It is the install page agents and marketplaces read, so it is not a lesser surface — it was
  // just an unguarded one. A guard with a hole is worse than no guard: this test passed 8/8 green
  // while a shipped file disagreed with the other four. Any NEW agent-facing file that states a
  // corpus figure belongs here on the day it is created.
  const files = {
    "server.json": read("../server.json"),
    "claude-plugin.json": read("../claude-plugin.json"),
    "README.md": read("../README.md"),
    "index.js": read("../index.js"),
    "llms-install.md": read("../llms-install.md"),
  };

  const entity = {}; // file -> distinct "<n>M entities" figures found
  const source = {}; // file -> distinct "<n> registries/sources" counts found
  for (const [where, raw] of Object.entries(files)) {
    // Collapse shields %20 escapes so a badge reads like the surrounding prose.
    const text = raw.replace(/%20/g, " ");
    // "<n>M entities" — deliberately NOT "<n>M rows" (index.js quotes one source's 65.2M rows).
    const ent = [...text.matchAll(/([\d.]+)\s*M\s+entities/g)].map((m) => m[1]);
    // "31 registries", "31 fused registries", and the badge's "sources-31 fused" (digit after word).
    const src = [
      ...[...text.matchAll(/(\d+)\s+(?:[A-Za-z/-]+\s+){0,2}(?:registries|sources)\b/g)].map((m) => m[1]),
      ...[...text.matchAll(/\b(?:registries|sources)\D{0,4}(\d+)/g)].map((m) => m[1]),
    ];
    if (ent.length) entity[where] = [...new Set(ent)];
    if (src.length) source[where] = [...new Set(src)];
  }

  // A slot that stopped stating a figure is itself a drift (deleted instead of updated).
  for (const where of Object.keys(files)) {
    assert.ok(entity[where]?.length, `${where} states no "<n>M entities" figure — expected the corpus total`);
    assert.ok(source[where]?.length, `${where} states no "<n> registries/sources" figure — expected the source count`);
  }

  const entitySet = [...new Set(Object.values(entity).flat())];
  const sourceSet = [...new Set(Object.values(source).flat())];
  assert.equal(
    entitySet.length,
    1,
    `entity total drifted across manifests — found ${JSON.stringify(entity)}. A data-refresh slot was missed.`,
  );
  assert.equal(
    sourceSet.length,
    1,
    `source/registry count drifted across manifests — found ${JSON.stringify(source)}. A data-refresh slot was missed.`,
  );
});
