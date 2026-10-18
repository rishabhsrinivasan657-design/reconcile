#!/usr/bin/env node
// Start Reconcile's MCP server from any folder: `node /path/to/reconcile/packages/mcp/bin/reconcile-mcp.mjs`.
// No pnpm involved, so it doesn't depend on which folder the assistant starts it in, and nothing but
// MCP messages reaches standard output.
import { register } from 'tsx/esm/api';

register();
await import('../src/main.ts');
