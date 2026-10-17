# ADR-0013: Live updates through Redis and server-sent events

- **Status:** Accepted
- **Date:** 2026-10-17
- **Requirements:** M5 AC-2, AC-3 (answer to M5 Q2: real-time)

## Context
After an upload, the clerk should watch each file move through *uploaded → reading →
ready → matched* without refreshing. The changes happen in the **worker**, but browsers
talk to the **API**. Something has to carry the news from one to the other.

## Options
1. **Polling** (the browser asks every few seconds): simplest / a few seconds of lag,
   and lots of requests that mostly say "nothing new".
2. **WebSockets** (a two-way connection): instant / two-way isn't needed, and it needs
   extra libraries and more care with proxies.
3. **Server-sent events (SSE)** plus **Redis announcements (pub/sub)**: the worker
   announces each change on a Redis channel, the API listens and forwards it down a
   one-way connection the browser keeps open. Instant, built into every browser,
   and we already run Redis.

## Decision
Option 3. The worker (and the API, for human actions) publishes small messages such as
`{ kind: "document", id, status }` or `{ kind: "set", poNumber, status }` on the
`reconcile:events` channel. `GET /events` streams them to browsers, with a heartbeat
every 25 seconds. The browser treats each message as "this data is stale" and lets
TanStack Query refetch it, so the messages never carry full records.

## Consequences
- ➕ Updates arrive in well under a second, with no extra service to run.
- ➕ Messages are hints, not data: a missed message is harmless, because on reconnect
  the browser refetches everything once.
- ➖ Each open browser tab holds one connection to the API. Fine for a team; a big
  deployment would need a look at connection limits.
- ➖ Redis pub/sub doesn't store messages. That's acceptable because of the point above.
