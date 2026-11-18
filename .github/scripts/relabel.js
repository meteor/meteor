/**
 * Migration to the labels of .github/labels.yml, run by .github/workflows/labels.yml.
 *
 * The sync renames the main old label of each new label (`from_name`). This script
 * covers what a rename cannot:
 * 1. Merges: every issue or PR carrying one of the old labels below gets the new one,
 *    open items first, closed ones last.
 * 2. Open issues without any `status:` label get `status: needs-triage`.
 * 3. Open issues opened before Meteor 3.0 shipped, feature requests aside, get
 *    `legacy: needs-review`, once: an issue that ever had a `legacy:` label is
 *    skipped, so a triager who removed it after a check on 3.x keeps it removed.
 *
 * It is idempotent and stays under the hourly limits of the workflow token: when
 * one is reached it waits for it to clear and goes on, so one run migrates the whole
 * repository. Close to the job's time limit it stops, and the next run picks up
 * where it left off.
 * It returns the number of items still to label, so the workflow deletes the old
 * labels only once nothing is left: after a complete run it lists the merged labels
 * again and counts every item still missing its new label.
 */
const fs = require('fs');
const path = require('path');

const MERGES = {
  bug: 'type: bug',
  enhancement: 'type: feature',
  'Project:Accounts (in user apps)': 'area: accounts',
  'Project:Accounts:UI': 'area: accounts',
  'Project:Accounts:OAuth': 'area: accounts',
  'Project:Accounts:Passwordless': 'area: accounts',
  'Project:Accounts:2fa': 'area: accounts',
  'Project:roles': 'area: accounts',
  'Project:JS Environment': 'area: build',
  'Project:Isobuild:Minifiers': 'area: build',
  'Project:Isobuild:Performance': 'area: build',
  'Project:Isobuild:Compilers': 'area: build',
  'Project:CSS': 'area: build',
  'Project:HMR': 'area: build',
  'Project:Dynamic Import': 'area: build',
  'Project:Modules': 'area: build',
  'Project:Tree shaking': 'area: build',
  'legacy-build-stack': 'area: build',
  'native-build-stack': 'area: build',
  'Project:TypeScript-conversion': 'area: types',
  TypeScript: 'area: types',
  'Project:Tool:Shell': 'area: cli',
  'Project:Installer': 'area: cli',
  'Project:Version Solver': 'area: cli',
  'Project:Guide': 'area: docs',
  'Project:Apple': 'area: mobile',
  'Project:Utilities': 'area: packages',
  'Project:Utilities:HTTP': 'area: packages',
  'Project:Imported Packages': 'area: packages',
  'Project:Fetch': 'area: packages',
  'Project:Webapp:Browser Policy': 'area: webapp',
  'Project:Deploy Server': 'area: webapp',
  'Project:Server Performance': 'area: webapp',
  'waiting-feedback': 'status: needs-info',
  'needs-investigation': 'status: confirmed',
  'Impact:most': 'priority: critical',
  hacktoberfest: 'help wanted',
};

const NEEDS_TRIAGE = 'status: needs-triage';
// `status: stale` says nothing about triage, so it does not count as a status here.
const STALE = 'status: stale';
// Status labels before the rename, so the dry run on the pull request is accurate.
const OLD_STATUSES = ['triage', 'needs-reproduction', 'not-ready', 'waiting-feedback', 'confirmed',
  'needs-investigation', 'in-discussion', 'ready', 'in-development', 'pending-tests'];
const LEGACY_REVIEW = 'legacy: needs-review';
// Meteor 3.0 shipped on July 15, 2024.
const METEOR_3 = '2024-07-15';
// Feature labels before and after the migration: a feature request is not tied to a release.
const FEATURES = ['type: feature', 'Type:Feature', 'enhancement'];
// Requests kept in reserve for the other workflows sharing the token budget.
const RESERVE = 200;
// Writes per rolling hour, below GitHub's secondary limit of 500, which also counts
// the label writes of the sync step just before.
const MAX_WRITES = 400;
const HOUR = 60 * 60 * 1000;
// Stop well before the 6 hour limit of a job.
const RUN_TIME = 5 * HOUR;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Names and renames of .github/labels.yml, whose entries keep one key per line.
function readManifest(text) {
  const names = new Set();
  const renames = new Map();
  let current;
  for (const line of text.split('\n')) {
    const match = line.match(/^(- name|  from_name):\s*["']?(.*?)["']?\s*$/);
    if (!match) continue;
    if (match[1] === '- name') names.add((current = match[2]));
    else renames.set(match[2], current);
  }
  return { names, renames };
}

// An open issue without a status says nobody triaged it yet.
const isUntriaged = (item) =>
  !item.labels.some(
    (label) => (label.name.startsWith('status: ') && label.name !== STALE) || OLD_STATUSES.includes(label.name)
  );

// Opened before 3.0, not a feature request, never reviewed.
const isLegacy = (item) =>
  item.created_at < METEOR_3 &&
  !item.labels.some((label) => label.name.startsWith('legacy: ') || FEATURES.includes(label.name));

// Whether a `legacy:` label was ever added to the issue, even if removed since.
// Only `labeled` and `unlabeled` events carry a label, and the issue events API
// keeps them for the whole life of the issue.
async function hadLegacyLabel(github, { owner, repo }, item) {
  const events = await github.paginate(github.rest.issues.listEvents, {
    owner,
    repo,
    issue_number: item.number,
    per_page: 100,
  });
  return events.some((event) => event.label?.name.startsWith('legacy: '));
}

module.exports = async ({ github, context, dryRun, runTime = RUN_TIME }) => {
  const { owner, repo } = context.repo;
  // The dry run comes before the sync: read the labels as renamed.
  const { renames } = readManifest(fs.readFileSync(path.join(__dirname, '../labels.yml'), 'utf8'));
  const carries = (item, name) => item.labels.some((label) => (renames.get(label.name) ?? label.name) === name);
  const planned = new Set();
  const stopAt = Date.now() + runTime;
  // Times of the writes in the last hour.
  const writes = [];
  let remaining = Infinity;
  let reset = 0;
  let applied = 0;
  let left = 0;

  // Waits until a write fits under both limits. False when the wait would outlast the run.
  async function waitForBudget() {
    for (;;) {
      const now = Date.now();
      while (writes.length && writes[0] <= now - HOUR) writes.shift();
      let until = now;
      if (remaining < RESERVE) until = Math.max(until, reset * 1000);
      if (writes.length >= MAX_WRITES) until = Math.max(until, writes[0] + HOUR);
      if (until <= now) return true;
      if (until >= stopAt) return false;
      console.log(`Waiting ${Math.ceil((until - now) / 60000)} min for the rate limit`);
      await sleep(until - now);
    }
  }

  // Writes the label. A secondary rate limit answers 403 or 429: wait as GitHub asks,
  // at least a minute, and try again. Null when the wait would outlast the run.
  async function write(item, label) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await github.rest.issues.addLabels({ owner, repo, issue_number: item.number, labels: [label] });
      } catch (error) {
        if (![403, 429].includes(error.status) || !/rate limit/i.test(error.message) || attempt === 3) throw error;
        const wait = Math.max(Number(error.response?.headers?.['retry-after'] ?? 0) * 1000, 60 * 1000);
        if (Date.now() + wait >= stopAt) return null;
        console.log(`Rate limited, waiting ${Math.ceil(wait / 60000)} min`);
        await sleep(wait);
      }
    }
  }

  const list = (params) =>
    github.paginate(github.rest.issues.listForRepo, { owner, repo, per_page: 100, ...params });

  async function addLabel(item, label) {
    // An item can carry several old labels merging into the same new one.
    const key = `${item.number} ${label}`;
    if (planned.has(key)) return;
    planned.add(key);
    const response = dryRun || left > 0 || !(await waitForBudget()) ? null : await write(item, label);
    if (!response) {
      left++;
      console.log(`#${item.number}: + ${label}`);
      return;
    }
    remaining = Number(response.headers['x-ratelimit-remaining'] ?? Infinity);
    reset = Number(response.headers['x-ratelimit-reset'] ?? 0);
    writes.push(Date.now());
    applied++;
    // Stay under GitHub's secondary limit on write requests (80 per minute).
    await sleep(1000);
  }

  // Once a run stops, the next one takes over: no need to spend more requests.
  const stopped = () => !dryRun && left > 0;

  async function moveMerged(state) {
    for (const [oldLabel, newLabel] of Object.entries(MERGES)) {
      if (stopped()) return;
      for (const item of await list({ labels: oldLabel, state })) {
        if (!carries(item, newLabel)) {
          await addLabel(item, newLabel);
        }
      }
    }
  }

  // Open items first (about 300 writes, minutes), then the history of closed ones.
  await moveMerged('open');

  for (const item of await list({ state: 'open' })) {
    if (item.pull_request) continue;
    if (stopped()) break;
    if (isUntriaged(item)) {
      await addLabel(item, NEEDS_TRIAGE);
    }
    if (isLegacy(item) && !(await hadLegacyLabel(github, context.repo, item))) {
      await addLabel(item, LEGACY_REVIEW);
    }
  }

  await moveMerged('closed');

  // Before the old labels are deleted, read them again: every item still carrying
  // one must already carry its new label.
  if (!dryRun && left === 0) {
    for (const [oldLabel, newLabel] of Object.entries(MERGES)) {
      for (const item of await list({ labels: oldLabel, state: 'all' })) {
        if (!carries(item, newLabel)) {
          left++;
          console.log(`#${item.number}: still without ${newLabel}`);
        }
      }
    }
  }

  console.log(JSON.stringify({ applied, left, dryRun: Boolean(dryRun) }, null, 2));
  return left;
};

Object.assign(module.exports, {
  MERGES,
  NEEDS_TRIAGE,
  LEGACY_REVIEW,
  readManifest,
  hadLegacyLabel,
  isUntriaged,
  isLegacy,
});
