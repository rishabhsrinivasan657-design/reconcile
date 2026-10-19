# M7: Deploy to AWS. Retrospective

- **Date:** 2026-10-18
- **Release:** [v1.0.0](https://github.com/rishabhsrinivasan657-design/reconcile/releases/tag/v1.0.0) · [PR #8](https://github.com/rishabhsrinivasan657-design/reconcile/pull/8)
- **Plan vs. reality:** 13 criteria, all pass on a real AWS Free-plan account. We planned 8 commits
  and made about 15 (plus docs). The live site runs at about $17.50 a month of credits.

## What went well
- **Checking the pricing first.** AWS changed its free offer in 2025; designing for the new Free plan
  (credits, can't be charged) instead of the old "12 months free" kept "$0" true.
- **Running production locally before the cloud.** The same containers on ARM Docker found three
  bugs before AWS ever saw them, including two security ones in Caddy (the secret check was skipped,
  and the secret was logged).
- **The full cycle worked on the first real try.** Deploy, update with data kept, teardown with
  nothing left, and deploy again, each with a passing smoke test.
- **Least privilege paid for itself in confidence.** No SSH, server reads only its own secrets, the app's
  database user can't change history. Each was checked live, not just written down.

## What didn't
- **I stopped the wrong processes, twice in spirit.** A port lookup also matched two app helper
  processes connected as clients; my shell happened to make the stop do nothing. Earlier, a too-broad
  pattern stopped my dev servers and likely Docker. Both lessons are below.
- **A failed check didn't stop a commit.** The shellcheck exception was in the wrong place, and the
  commit went out anyway because the command didn't stop on failure; fixed in the next commit.
- **Setup friction on your Mac.** Homebrew needed Apple's Command Line Tools updated, which only you can
  do (it needs your password). The README now mentions it.
- **Root sign-in.** We deployed while signed in as the account's root user, by your informed choice;
  a dedicated admin user would be safer for anything beyond this demo.

## Lessons
- Find processes to stop by **listening** port (`lsof -sTCP:LISTEN`) or exact ID, never by a word in
  their name or a port they merely connect to.
- Chain checks so a failure **stops** the commit (`check && commit`), and read the check's output.
- Run the production setup locally first; most cloud bugs aren't cloud bugs.
- Put "how much will this cost, and how do I stop it" in the requirements, not the release notes.

## Follow-ups (backlog)
- **Deploy on merge** (needs AWS credentials in GitHub, e.g. OIDC): left out of M7 on purpose
- A non-root admin user for deploys (IAM Identity Center)
- Database backups for the live demo (a snapshot before each update)
- **B-21 … B-26** still open from earlier milestones
