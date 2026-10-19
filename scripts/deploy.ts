/**
 * Deploy Reconcile to AWS and remove it again (M7, ADR-0015).
 *
 *   pnpm deploy:up         create or update everything, deploy the current commit, smoke-test it
 *   pnpm deploy:down       delete everything, then check nothing billable is left
 *   pnpm deploy:smoke      run the live smoke test against the deployed site
 *   pnpm deploy:leftovers  only the "nothing billable is left" check
 *
 * Needs the AWS command-line tool (signed in with `aws login` or `aws configure sso`) and Terraform.
 * It never asks for or prints AWS keys; Terraform and the AWS tool use your existing sign-in.
 */
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { repoRoot } from './docs-lib.ts';

const infra = path.join(repoRoot, 'infra');
const tfvars = path.join(infra, 'terraform.tfvars');

class Stop extends Error {}
const stop = (message: string): never => {
  throw new Stop(message);
};
const say = (message: string) => console.log(`\n▸ ${message}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run a command, showing its output; stops with `failure` if it fails. */
function run(cmd: string, args: string[], failure: string, opts: SpawnSyncOptions = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
  if (r.error || r.status !== 0) stop(failure);
}

/** Run a command and return what it printed (trimmed), or undefined if it failed. */
function capture(cmd: string, args: string[]): string | undefined {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: repoRoot });
  return r.error || r.status !== 0 ? undefined : r.stdout.trim();
}

const aws = (region: string, args: string[]) =>
  capture('aws', [...args, '--region', region, '--output', 'json']);
const awsJson = <T>(region: string, args: string[]): T | undefined => {
  const out = aws(region, args);
  return out ? (JSON.parse(out) as T) : undefined;
};

function preflight() {
  say('Checking your tools and AWS sign-in');
  if (!capture('terraform', ['version']))
    stop('Terraform is not installed. Install it with: brew install hashicorp/tap/terraform');
  if (!capture('aws', ['--version']))
    stop('The AWS command-line tool is not installed. Install it with: brew install awscli');
  const who = awsJson<{ Account: string }>(region(), ['sts', 'get-caller-identity']);
  if (!who)
    stop('You are not signed in to AWS. Run `aws login` (or `aws configure sso`), then try again.');
  console.log(`  Signed in to AWS account ${who!.Account}.`);
}

function region(): string {
  return process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
}

interface Outputs {
  url: string;
  instance_id: string;
  region: string;
  distribution_id: string;
  demo_password_parameter: string;
}
function outputs(): Outputs {
  const raw = capture('terraform', [`-chdir=${infra}`, 'output', '-json']);
  const parsed = raw ? (JSON.parse(raw) as Record<string, { value: string }>) : {};
  if (!parsed.url)
    stop('Nothing is deployed yet (no Terraform outputs). Run `pnpm deploy:up` first.');
  return Object.fromEntries(
    Object.entries(parsed).map(([k, v]) => [k, v.value]),
  ) as unknown as Outputs;
}

const demoPassword = (o: Outputs) =>
  aws(o.region, [
    'ssm',
    'get-parameter',
    '--with-decryption',
    '--name',
    o.demo_password_parameter,
    '--query',
    'Parameter.Value',
  ])?.replace(/^"|"$/g, '') ?? stop('Could not read the demo password from the parameter store.');

async function ensureTfvars() {
  if (fs.existsSync(tfvars)) return;
  let email = process.env.DEPLOY_ALERT_EMAIL;
  if (!email) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    email = (await rl.question('Email address for the budget alarms: ')).trim();
    rl.close();
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) stop('That does not look like an email address.');
  fs.writeFileSync(tfvars, `alert_email = "${email}"\n`);
  console.log('  Saved to infra/terraform.tfvars (ignored by Git).');
}

function deployedCommit(): string {
  const commit = capture('git', ['rev-parse', 'HEAD']) ?? stop('Not inside the Git repository.');
  if (capture('git', ['status', '--porcelain']))
    console.log('  Note: you have uncommitted changes. Only committed, pushed code is deployed.');
  capture('git', ['fetch', '--quiet', 'origin']);
  if (!capture('git', ['branch', '-r', '--contains', commit]))
    stop(
      `Commit ${commit.slice(0, 7)} isn't on GitHub yet. The server builds from GitHub: push it first.`,
    );
  return commit;
}

async function waitFor<T>(
  what: string,
  minutes: number,
  check: () => T | undefined | false,
): Promise<T> {
  const until = Date.now() + minutes * 60_000;
  for (;;) {
    const v = check();
    if (v) return v;
    if (Date.now() > until) stop(`Gave up waiting for ${what} after ${minutes} minutes.`);
    await sleep(10_000);
  }
}

/** Run deploy/update.sh on the server through Session Manager and stream the result. */
async function deployOnServer(o: Outputs, commit: string) {
  say('Waiting for the server to be reachable through Session Manager');
  await waitFor('the server', 15, () => {
    const info = awsJson<{ InstanceInformationList: { PingStatus: string }[] }>(o.region, [
      'ssm',
      'describe-instance-information',
      '--filters',
      `Key=InstanceIds,Values=${o.instance_id}`,
    ]);
    return info?.InstanceInformationList[0]?.PingStatus === 'Online';
  });

  say(`Deploying ${commit.slice(0, 7)} on the server (the first time takes about 15 minutes)`);
  const commands = [
    'set -e',
    'cloud-init status --wait > /dev/null || true',
    'test -f /var/lib/cloud/reconcile-ready || { echo "First-boot setup did not finish; see /var/log/cloud-init-output.log"; exit 1; }',
    '/usr/local/bin/reconcile-write-env',
    'cd /opt/reconcile',
    `git fetch --quiet --depth 1 origin ${commit}`,
    'git checkout --quiet --force FETCH_HEAD',
    `bash deploy/update.sh ${commit}`,
  ];
  const params = path.join(infra, '.deploy-command.json');
  fs.writeFileSync(params, JSON.stringify({ commands, executionTimeout: ['3600'] }));
  const sent = awsJson<{ Command: { CommandId: string } }>(o.region, [
    'ssm',
    'send-command',
    '--instance-ids',
    o.instance_id,
    '--document-name',
    'AWS-RunShellScript',
    '--comment',
    `reconcile deploy ${commit.slice(0, 7)}`,
    '--timeout-seconds',
    '600',
    '--parameters',
    `file://${params}`,
  ]);
  fs.rmSync(params, { force: true });
  if (!sent) stop('Session Manager refused the deploy command.');
  const id = sent!.Command.CommandId;

  const result = await waitFor('the deploy to finish', 60, () => {
    const r = awsJson<{
      Status: string;
      StandardOutputContent: string;
      StandardErrorContent: string;
    }>(o.region, [
      'ssm',
      'get-command-invocation',
      '--command-id',
      id,
      '--instance-id',
      o.instance_id,
    ]);
    return r && !['Pending', 'InProgress', 'Delayed'].includes(r.Status) ? r : undefined;
  });
  const tail = (s: string) => s.trim().split('\n').slice(-25).join('\n');
  console.log(tail(result.StandardOutputContent));
  if (result.Status !== 'Success') {
    console.error(tail(result.StandardErrorContent));
    stop(
      `The deploy on the server ended with "${result.Status}". Details above; full log via Session Manager.`,
    );
  }
}

function smoke(o: Outputs) {
  say(`Live smoke test against ${o.url}`);
  run(
    'pnpm',
    [
      '--filter',
      '@reconcile/web',
      'exec',
      'playwright',
      'test',
      '--config',
      'playwright.live.config.ts',
    ],
    'The live smoke test failed (see above).',
    { env: { ...process.env, LIVE_URL: o.url, DEMO_PASSWORD: demoPassword(o) } },
  );
}

async function up() {
  preflight();
  const commit = deployedCommit();
  await ensureTfvars();
  say('Creating or updating the AWS resources (Terraform shows the plan and asks you to confirm)');
  run('terraform', [`-chdir=${infra}`, 'init', '-input=false'], 'terraform init failed.');
  run(
    'terraform',
    [`-chdir=${infra}`, 'apply', `-var=region=${region()}`],
    'terraform apply did not finish.',
  );
  const o = outputs();
  await deployOnServer(o, commit);

  say('Waiting for CloudFront to finish setting up the HTTPS address (first time: a few minutes)');
  run(
    'aws',
    ['cloudfront', 'wait', 'distribution-deployed', '--id', o.distribution_id],
    'CloudFront did not finish.',
  );
  await waitFor('the site to answer', 10, () => {
    const code = capture('curl', [
      '-s',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      `${o.url}/api/health`,
    ]);
    return code === '200';
  });
  smoke(o);

  console.log(`
✔ Reconcile is live: ${o.url}
  Demo password (to unlock changes): ${demoPassword(o)}
  It runs on your Free plan credits (about $17.50 a month). Remove everything with: pnpm deploy:down`);
}

async function leftovers() {
  const r = region();
  say(`Checking for anything left in ${r} tagged Project=reconcile`);
  const found: string[] = [];
  const instances = awsJson<{ Reservations: { Instances: { InstanceId: string }[] }[] }>(r, [
    'ec2',
    'describe-instances',
    '--filters',
    'Name=tag:Project,Values=reconcile',
    'Name=instance-state-name,Values=pending,running,stopping,stopped',
  ]);
  for (const i of instances?.Reservations.flatMap((x) => x.Instances) ?? [])
    found.push(`server ${i.InstanceId}`);
  const volumes = awsJson<{ Volumes: { VolumeId: string }[] }>(r, [
    'ec2',
    'describe-volumes',
    '--filters',
    'Name=tag:Project,Values=reconcile',
  ]);
  for (const v of volumes?.Volumes ?? []) found.push(`disk ${v.VolumeId}`);
  const addresses = awsJson<{ Addresses: { PublicIp: string }[] }>(r, [
    'ec2',
    'describe-addresses',
    '--filters',
    'Name=tag:Project,Values=reconcile',
  ]);
  for (const a of addresses?.Addresses ?? []) found.push(`public address ${a.PublicIp}`);
  const cdn = awsJson<{ DistributionList: { Items?: { Id: string; Comment: string }[] } }>(r, [
    'cloudfront',
    'list-distributions',
  ]);
  for (const d of cdn?.DistributionList.Items?.filter((x) => x.Comment === 'reconcile') ?? [])
    found.push(`CloudFront ${d.Id}`);
  const params = awsJson<{ Parameters: { Name: string }[] }>(r, [
    'ssm',
    'get-parameters-by-path',
    '--path',
    '/reconcile/',
  ]);
  for (const p of params?.Parameters ?? []) found.push(`parameter ${p.Name}`);
  if (found.length)
    stop(
      `Still in your account:\n  - ${found.join('\n  - ')}\nRun \`pnpm deploy:down\` again, or remove them in the AWS console.`,
    );
  console.log('✔ Nothing billable is left.');
}

async function down() {
  preflight();
  say('Deleting everything Terraform created (it shows the plan and asks you to confirm)');
  run('terraform', [`-chdir=${infra}`, 'init', '-input=false'], 'terraform init failed.');
  run(
    'terraform',
    [`-chdir=${infra}`, 'destroy', `-var=region=${region()}`],
    'terraform destroy did not finish.',
  );
  await leftovers();
}

const commands: Record<string, () => Promise<void> | void> = {
  up,
  down,
  smoke: () => {
    preflight();
    smoke(outputs());
  },
  leftovers: async () => {
    preflight();
    await leftovers();
  },
};

const name = process.argv[2] ?? '';
try {
  const cmd =
    commands[name] ?? stop(`Unknown command "${name}". Use: up, down, smoke, or leftovers.`);
  await cmd();
} catch (e) {
  if (e instanceof Stop) {
    console.error(`\n✘ ${e.message}`);
    process.exit(1);
  }
  throw e;
}
