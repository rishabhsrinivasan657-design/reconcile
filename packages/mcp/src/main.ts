/**
 * Start the connector on standard input/output, the way AI assistants run local MCP servers.
 * Standard output carries only MCP messages, so anything else goes to standard error.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.ts';

const apiUrl = process.env.RECONCILE_API_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`;
const webUrl = process.env.RECONCILE_WEB_URL ?? 'http://localhost:3000';

const server = createServer({ apiUrl, webUrl });
await server.connect(new StdioServerTransport());
console.error(`Reconcile MCP server ready (API ${apiUrl}, website ${webUrl}).`);
