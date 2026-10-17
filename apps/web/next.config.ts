import type { NextConfig } from 'next';

const api = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 3001}`;

/** The website only talks to the API (ADR-0012): every /api/* request is forwarded to it. */
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  // Server-sent events must stream through the forwarder, not be buffered and compressed.
  compress: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/:path*` }];
  },
};
export default config;
