# WhiteIntel MCP server — containerised stdio server (opens the Docker MCP Catalog + any
# container-based agent host). Builds from source, so it is always the current 21-tool server
# regardless of the npm package version.
#
#   docker build -t whiteintel/mcp-server .
#   docker run --rm -i whiteintel/mcp-server                         # anonymous free tier
#   docker run --rm -i -e WHITEINTEL_API_KEY=wi_xxx whiteintel/mcp-server   # lifts free-tier limits
#
# MCP speaks over stdio, so run with -i (attach stdin) and no TTY; there is no port to expose.
FROM node:22-alpine

WORKDIR /app

# Install production dependencies first for better layer caching. --omit=dev keeps the image lean
# (only @modelcontextprotocol/sdk); package-lock.json is committed so `npm ci` is reproducible.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# The runnable server: the entrypoint plus its one local module. package.json above already carries
# "type":"module" (ESM) and the dependency manifest.
COPY index.js lib.js ./

# stdio transport — no EXPOSE. WHITEINTEL_API_KEY is read from the environment when provided.
ENTRYPOINT ["node", "index.js"]
