# Installing the WhiteIntel MCP server (for agents & marketplaces)

WhiteIntel is a **free, agent-native** corporate-ownership & sanctions intelligence graph:
~130.7M entities and ~22.3M ownership/control edges fused from **31 registries** into one
source-cited graph, with sanctions/PEP screening, UBO chain tracing, and **in-flow dossier
purchase** (an agent can hand a permanent payment link to a human). **21 tools.** No account
required — anonymous free tier; an optional `WHITEINTEL_API_KEY` lifts limits.

## Recommended install — local (stdio), always current

```json
{
  "mcpServers": {
    "whiteintel": {
      "command": "npx",
      "args": ["-y", "github:Hei33enberg/WhiteIntel-OS"]
    }
  }
}
```

The GitHub source always delivers the current server (21 tools). The npm package
`@whiteintel/mcp-server` is an alternative source but can lag; prefer the GitHub install until
the npm release is current.

Optional — lift free-tier limits with your key:

```json
{
  "mcpServers": {
    "whiteintel": {
      "command": "npx",
      "args": ["-y", "github:Hei33enberg/WhiteIntel-OS"],
      "env": { "WHITEINTEL_API_KEY": "wi_xxx" }
    }
  }
}
```

## Hosted (Streamable-HTTP, no install)

For chatbots/clients that cannot spawn a subprocess, POST JSON-RPC 2.0 to:

```
https://whiteintel.dev/api/mcp
```

## The 21 tools

- **Discovery:** `search_entities`, `semantic_search`, `find_similar`, `search_companies`
- **Lookup:** `lookup_company`, `lookup_by_identifier`, `get_entity`, `resolve`
- **Intelligence:** `get_dossier`, `trace_ownership_path`, `get_financials`, `get_pulse`, `get_company_details`
- **Graph:** `graph_neighbourhood`, `graph_path`
- **Risk:** `get_sanctions`, `check_offshore_exposure`
- **Commerce (agent-payable):** `get_pricing`, `buy_dossier`, `claim_dossier`, `get_payment_link`

## Verify it works

After install, list tools (should be 21) and try:
`search_entities` with `{ "q": "Ardent" }` — returns cited entity hits, no auth required.

## Links

- Site: https://whiteintel.dev
- OpenAPI (no auth): https://whiteintel.dev/api/public/openapi.json
- Agent map: https://whiteintel.dev/llms.txt · https://whiteintel.dev/llms-full.txt
- Repo: https://github.com/Hei33enberg/WhiteIntel-OS
