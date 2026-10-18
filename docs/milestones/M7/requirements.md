# M7: Deploy to AWS. Requirements

- **Status:** Draft, waiting for your approval
- **Links to the PRD:** US-12 · NFR-01 (cost) · risk "AWS free deploy incurs cost" · ADR-0005 (audit log, part 2)
- **Release when done:** v1.0.0 (the last planned milestone)

## In one sentence

With one command, Reconcile goes live on AWS at an HTTPS link you can share, and with one more
command everything is removed again, all without spending money.

## What deploying means here, in plain words

Right now Reconcile runs on your laptop. **Deploying** means running the same pieces (database,
Redis, API, worker, website) on a computer in Amazon's cloud, so others can open it. **Terraform**
is a tool where you describe that cloud setup in files ("one small server, these firewall rules, a
budget alarm"), and it creates, updates, or deletes exactly that. The files live in the repo, so the
setup is reviewable and repeatable, and `destroy` removes all of it.

## The money question (the most important part)

AWS changed its free offer in July 2025:

- **New accounts** choose a **Free plan** or a **Paid plan**. The Free plan gives $100 in credits
  (up to $200 by finishing a few getting-started tasks) and lasts 6 months or until the credits run
  out. A Free plan account **can't be charged**: when it ends, it must be upgraded or it closes.
- **Accounts opened before 15 July 2025** keep the old offer: 12 months of a small free server
  (t2/t3.micro, 750 hours a month), then normal prices.
- Some services are always free for everyone within limits (for example CloudFront, which can give
  us an HTTPS link without buying a domain).

So "$0" means: run on a **Free plan account** (it can't be billed), or on an older account with a
**budget alarm**, and make tearing down a single command.

## User stories

| ID | Who | Wants to… | So that… |
|---|---|---|---|
| US-12 | developer | deploy a demo to AWS with one command and tear it down cleanly | they can share a live link at $0 |
| US-12b | portfolio visitor | open the live link and try Reconcile | they see it working without installing anything |

## What "done" means (acceptance criteria)

### A. One command up, one command down
- [ ] **AC-1 Deploy.** `pnpm deploy:up` creates everything (server, network, firewall, HTTPS link,
  budget alarm), starts Reconcile, loads the demo data, and prints the link. Running it again
  changes nothing if nothing changed.
- [ ] **AC-2 Tear down.** `pnpm deploy:down` deletes everything Terraform created, and a check
  afterwards confirms nothing billable is left (no servers, disks, or public addresses).
- [ ] **AC-3 Update.** After a code change, `pnpm deploy:up` updates the running site without
  losing the demo's decisions.

### B. Costs stay at $0
- [ ] **AC-4 Budget alarm.** An AWS budget emails you when any cost is forecast or charged (a
  threshold of $1), created by Terraform.
- [ ] **AC-5 Small and free-eligible.** Only free-plan-eligible, small resources are used (one
  small server; no managed database, load balancer, or NAT gateway, which are the usual surprise
  costs). The design doc lists every resource and its expected monthly cost against the credits.
- [ ] **AC-6 No AI spending in the cloud.** The live site uses the recorded AI answers (no AI key is
  stored in AWS), unless you choose otherwise in Q3.

### C. Safe enough to share
- [ ] **AC-7 HTTPS.** The site is served over HTTPS at a stable AWS address, without buying a domain.
- [ ] **AC-8 Not an open door.** Strangers can't change the demo data or upload files unless you
  allow it (see Q2). The server only accepts web traffic; no remote-login port is open to the
  internet (administration goes through AWS's browser-based session tool instead).
- [ ] **AC-9 Secrets stay secret.** No passwords or keys in the repo, the Terraform files, or the
  logs. Database and other passwords are generated in the cloud and stored in AWS's parameter store.
- [ ] **AC-10 Audit log, part 2 (ADR-0005).** In the cloud, the app connects to the database as a
  user that is **not allowed** to edit or delete history entries, on top of the existing trigger.

### D. Proof
- [ ] **AC-11 Live smoke test.** After deploying, an automated check opens the live link and does
  the core flow (open problems, write one off with a note, find it in the history), then reports
  pass or fail.
- [ ] **AC-12 Checked in CI.** CI checks the Terraform files are valid and formatted on every pull
  request, without touching AWS or needing credentials.
- [ ] **AC-13 Instructions.** The README explains, from scratch: what you need (an AWS account, the
  AWS command-line tool, Terraform), how to sign in safely, and the two commands, with what each costs.

## Not in M7
- Buying a domain name, automatic scaling, multiple servers, or a managed database (cost).
- Deploying automatically on every merge (it would need AWS credentials in GitHub; the backlog).
- The AI-assistant connector over the internet (it stays local; M6).
- Logins and roles for the website (still one built-in user; the PRD keeps auth out of scope).

## Things we're assuming
- **You create the AWS account and sign in yourself.** Account creation and credentials are yours
  to handle; I never see or type passwords or keys. The README shows how to sign in from your own
  terminal (`aws configure sso` or `aws login`), after which Terraform uses that sign-in.
- The cloud server runs the **same containers** as local development (one small Linux server with
  Docker Compose), so "works on my machine" carries over.
- Terraform keeps its record of what it created (the *state file*) on your computer, not in the
  repo (it can contain secrets).

## Questions for you

- **Q1. Which AWS account will you use?**
  - **A: A new account on the Free plan** (it can't be charged; credits cover a small server for
    about 6 months).
  - **B: An existing account** (older ones may still have 12 months of free small servers; otherwise
    normal prices apply, so the budget alarm matters more).
  - *I recommend A* if you don't already have one: it's the only setup where a bill is impossible.
- **Q2. Who can change things on the live site?**
  - **A: Anyone with the link can look; changes need a shared demo password** (a simple gate in front
    of the site, not real user accounts).
  - **B: Read-only for everyone** (uploads, decisions, and corrections turned off on the live site).
  - **C: Fully open**, with the demo data reset every night.
  - *I recommend A*: visitors can try the full flow if you give them the password, and nothing
    changes by accident.
- **Q3. AI on the live site?**
  - **A: Recorded answers only** (no key in the cloud, no quota risk; uploads work for the test-set
    files and other files get a clear "demo mode" message).
  - **B: Live Gemini free tier** (any document can be read; your key is stored in AWS's parameter
    store and counts against your free quota).
  - *I recommend A* for a public demo.
