# ADR-0011: An API for quick answers, a worker for slow work, and a queue between them

- **Status:** Accepted (2026-10-17)
- **Date:** 2026-10-17
- **Requirements:** FR-01, FR-13, NFR-03 · M4 AC-1, AC-4, AC-5, AC-7

## The situation
Reading a document with AI takes about 8 seconds, and the AI provider only allows a
few requests per minute. If uploads waited for the AI, the website would freeze,
and a burst of uploads would hit the speed limit.

## Options we considered
1. **Do everything inside the upload request.** Simple, but slow and fragile: a
   timeout loses the work.
2. **A background thread inside the API.** Faster to answer, but if the API
   restarts, the unfinished work is lost, and there's no shared speed limit.
3. **A separate worker program and a queue (BullMQ on Redis).** The API saves the
   file and adds a job. Workers pick jobs up, retry failures, and share one speed
   limit through Redis.

## Decision
Option 3. Three rules make it safe:
- **Every job is safe to run twice.** A "read" job is named by the file's
  fingerprint, and a "match" job by its PO number. A second identical job is
  ignored or merged.
- **Each step saves its result and its history entry together** (one database
  transaction), so a crash can't leave half a result.
- **Results are versions, not overwrites.** Reading or matching again adds a new
  version. Human decisions carry over by the problem's fingerprint.

The shared logic lives in `packages/pipeline`, used by both the API and the worker.

## What this means
- ➕ Uploads answer instantly. Work survives restarts. Several workers can't break the AI's limits.
- ➕ The website (M5) and the AI-assistant connector (M6) read the same saved results.
- ➖ One more program to run (the worker). `pnpm dev` starts both together.
- ➖ Results appear a few seconds after upload, not instantly. The API shows each document's status.
