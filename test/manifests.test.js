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
