// Black-box smoke: spawn the server, send initialize + tools/list, and assert the EXACT tool
// count and version the client sees over the wire.
//
// It used to assert `length >= 9`, which is how this package shipped 0.7.0 to npm for weeks with
// two tools missing and nothing failing. A floor cannot catch a tool that quietly stopped being
// registered, and it cannot catch the drift this file now guards: the version string in index.js
// silently disagreeing with package.json (0.7.0 vs 0.7.1 once, 0.7.0 vs 0.7.3 on the hosted
// surface). Both are exact-match assertions now, and EXPECTED_TOOLS is a written-down list so a
// rename shows up as a named diff rather than an unchanged count.
//
// Network-free: only the MCP stdio handshake, no live API call.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const EXPECTED_TOOLS = [
  "lookup_company",
  "search_companies",
  "search_entities",
  "get_entity",
  "get_dossier",
  "trace_ownership_path",
  "graph_neighbourhood",
  "graph_path",
  "lookup_by_identifier",
  "get_sanctions",
  "check_offshore_exposure",
  "get_company_details",
  "get_financials",
  "get_pulse",
  "resolve",
  "get_pricing",
  "buy_dossier",
  "get_payment_link",
  "claim_dossier",
  "semantic_search",
  "find_similar",
];

const EXPECTED_VERSION = JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version;

const p = spawn("node", ["index.js"], { stdio: ["pipe", "pipe", "inherit"] });
let buf = "";
let done = false;
let seenVersion = null;

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  p.kill();
  process.exit(1);
};

p.stdout.on("data", (d) => {
  buf += d.toString();
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }

    if (msg.id === 1) {
      seenVersion = msg.result?.serverInfo?.version ?? null;
      if (seenVersion !== EXPECTED_VERSION) {
        fail(`serverInfo.version is ${JSON.stringify(seenVersion)} but package.json says ${EXPECTED_VERSION} — the wire version drifted from the manifest.`);
      }
      console.log(`OK: serverInfo.version ${seenVersion} matches package.json`);
    }

    if (msg.id === 2) {
      const tools = msg.result?.tools;
      if (!Array.isArray(tools)) fail("tools/list did not return an array");
      const names = tools.map((t) => t.name);
      if (names.length !== EXPECTED_TOOLS.length) {
        fail(`tools/list returned ${names.length} tools, expected ${EXPECTED_TOOLS.length}. Got: ${names.join(", ")}`);
      }
      const missing = EXPECTED_TOOLS.filter((n) => !names.includes(n));
      const extra = names.filter((n) => !EXPECTED_TOOLS.includes(n));
      if (missing.length || extra.length) {
        fail(`tool-name mismatch. missing=[${missing.join(", ")}] unexpected=[${extra.join(", ")}]`);
      }
      const undescribed = tools.filter((t) => !t.description || !t.inputSchema);
      if (undescribed.length) {
        fail(`tools missing a description or inputSchema: ${undescribed.map((t) => t.name).join(", ")}`);
      }
      console.log(`OK: tools/list returned ${names.length} tools, all named and described (${names.join(", ")})`);
      done = true;
      p.kill();
      process.exit(0);
    }
  }
});

const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "ci", version: "0" } },
});
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/list" });

setTimeout(() => {
  if (!done) {
    console.error("TIMEOUT: did not receive tools/list response in 8s");
    p.kill();
    process.exit(1);
  }
}, 8000);
