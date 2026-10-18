# M7: Deploy to AWS. Test plan

Written now, checked off in the Testing phase. "Local" means automated tests on your computer and in
CI. "Live" means against the real AWS deployment, which needs your account, so it happens in the
Testing phase with you.

## How each criterion gets checked

| AC | How we check it | Kind | Result |
|---|---|---|---|
| AC-1 Deploy | `pnpm deploy:up` from a clean start prints a working HTTPS link; a second run reports no changes | live | |
| AC-2 Tear down | `pnpm deploy:down` finishes and the leftovers check finds nothing tagged `Project=reconcile`; the AWS console's billing page shows nothing running | live | |
| AC-3 Update | Make a decision, deploy a new commit, and the decision is still there | live | |
| AC-4 Budget alarm | The budget exists with a $1 threshold and your email (seen in the console; Terraform plan shows it) | live | |
| AC-5 Small and free-eligible | The Terraform plan lists only the resources in design §2; the instance type is on the Free plan's eligible list; no RDS, load balancer, NAT gateway | local + live | |
| AC-6 No AI spending | The cloud `.env` has `LLM_MODE=replay` and no AI keys; uploading a non-test file shows the demo-mode message (worker test + live try) | local + live | |
| AC-7 HTTPS | The link is `https://…cloudfront.net`; the server's own address refuses direct requests | live | |
| AC-8 Not an open door | API tests: with `DEMO_PASSWORD` set, changes without the cookie get 401, a wrong password is refused, the right one unlocks; reading stays open. Live: a change without unlocking is refused. The firewall has no port 22. | local + live | |
| AC-9 Secrets stay secret | A scan of the repo, Terraform files, and container logs finds none of the generated values; the `.env` on the server is readable only by root | local + live | |
| AC-10 Audit log, part 2 | Database test: as the app user, `UPDATE` and `DELETE` on `AuditEvent` fail with a permission error; `INSERT` and `SELECT` work; normal tables work | local | |
| AC-11 Live smoke test | `pnpm deploy:smoke` passes against the live link | live | |
| AC-12 Checked in CI | The new CI job runs `terraform fmt -check`, `terraform validate`, and `shellcheck` without AWS credentials | local (CI) | |
| AC-13 Instructions | Follow the README from an empty AWS account to a working link and back to nothing | live | |

Also: the production containers start locally with `docker compose -f deploy/docker-compose.prod.yml
up` (with a test `.env`), and Caddy refuses requests without the secret header.

## Scoreboard
No change expected; M7 doesn't touch reading or matching.

## Demo steps
1. `pnpm deploy:up`, then open the printed link and click around.
2. Unlock changes with the printed demo password; write off a problem.
3. `pnpm deploy:down`, then confirm "Nothing billable is left".

## Results
(Filled in during the Testing phase.)
