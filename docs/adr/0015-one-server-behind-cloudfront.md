# ADR-0015: One small server behind CloudFront

- **Status:** Proposed
- **Date:** 2026-10-18
- **Requirements:** US-12, NFR-01, M7 AC-1, AC-5, AC-7

## Context
Reconcile has five parts (Postgres, Redis, API, worker, website) that already run together with
Docker Compose. The deploy must cost $0 on an AWS Free-plan account (credits, 6 months), use
HTTPS without buying a domain, and come down with one command.

## Options
1. **Managed services** (RDS for Postgres, ElastiCache, App Runner or ECS for the apps, a load
   balancer): production-shaped / several billed services, burns the credits in weeks, much more
   Terraform.
2. **Serverless** (Lambda + a managed database): cheap at rest / the worker, live updates, and
   Postgres don't fit Lambda well; a big rewrite.
3. **One small server running the same Compose stack, behind CloudFront**: the same containers as
   local development, one billed server, free HTTPS from CloudFront.

## Decision
Option 3. One `t4g.small` instance (Free-plan eligible, ARM, 2 GB) runs Postgres, Redis, the API,
the worker, the website, and Caddy. CloudFront provides the HTTPS address and is the only allowed
way in (AWS's CloudFront address list in the firewall, plus a secret header Caddy checks). The
server builds the containers from the public GitHub repo at the deployed commit, so no image
registry is needed. Administration uses Session Manager; no SSH port is open.

## Consequences
- ➕ About $17.50 a month of credits: inside the Free plan for its whole 6 months with $200 of credits.
- ➕ What runs in the cloud is what runs locally, so "works on my machine" mostly carries over.
- ➖ One server is one point of failure, with no backups beyond its disk. Fine for a demo; a real
  deployment would use managed Postgres and backups.
- ➖ Building on a 2 GB server is slow (minutes), and needs a swap file.
