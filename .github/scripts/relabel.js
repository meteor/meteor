/**
 * Migration to the labels of .github/labels.yml, run by .github/workflows/labels.yml.
 *
 * The sync renames the main old label of each new label (`from_name`). This script
 * covers what a rename cannot:
 * 1. Merges: every issue, pull request or discussion carrying one of the old labels
 *    below gets the new one, open items first, closed ones last. An old label the sync
 *    could not rename, because its new name already existed, is moved the same way.
 * 2. Open issues without any `status:` label get `status: needs-triage`.
 * 3. Open issues opened before Meteor 3.0 shipped, feature requests aside, get
 *    `legacy: needs-review`, once: an issue that ever had a `legacy:` label is
 *    skipped, so a triager who removed it after a check on 3.x keeps it removed.
 * 4. The open issues and pull requests decided one by one (ITEMS below) get and lose
 *    the labels listed there, as long as the migration lasts: until the merged labels
 *    are deleted.
 *
 * It is idempotent and stays under the hourly limits of the workflow token: when
 * one is reached it waits for it to clear and goes on, so one run migrates the whole
 * repository. Close to the job's time limit it stops, and the next run picks up
 * where it left off.
 * It returns 0 when nothing is left to label, so the workflow deletes the old labels
 * only then: after a complete run it lists the old labels again and counts every item
 * still missing its new label. A run that stopped returns a number above 0, which is
 * not the count of what remains.
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

// Open issues and pull requests decided one by one, on top of the renames and the
// merges: the labels to add and to remove.
const ITEMS = {
  // `Project:NPM` is deleted. These items would end without any area, and #13436
  // needs one more: a pull request gets the areas of the paths it changes
  // (.github/labeler.yml), an issue the area it reports on.
  11030: { add: ['area: build'] },
  12329: { add: ['area: build'] },
  13436: { add: ['area: build'] },
  13597: { add: ['area: build'] },
  13802: { add: ['area: build'] },
  13936: { add: ['area: build'] },
  14586: { add: ['area: cli'] },
  14615: { add: ['area: cli'] },
  14625: { add: ['area: cli'] },
  14796: { add: ['area: cli', 'area: rspack'] },
  14886: { add: ['area: rspack'] },
  14889: { add: ['area: mobile'] },
  // Experiments.
  14218: { add: ['experimental'] },
  14479: { add: ['experimental'] },
  14751: { add: ['experimental'] },
  // The npm dependencies with known CVEs: a security item, not a roadmap candidate.
  14825: { add: ['type: security'], remove: ['type: bug', 'priority: candidate'] },
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

const MANIFEST = path.join(__dirname, '../labels.yml');

// Discussions carry the labels of the repository too. Only the GraphQL API reads and
// labels them, and it cannot filter them by label. They are listed by creation date:
// the default order follows the last comment, so a discussion commented on between two
// pages would be skipped.
const DISCUSSIONS = `
  query ($owner: String!, $repo: String!, $after: String) {
    repository(owner: $owner, name: $repo) {
      discussions(first: 100, after: $after, orderBy: { field: CREATED_AT, direction: ASC }) {
        pageInfo { hasNextPage endCursor }
        nodes { id number title closed createdAt labels(first: 100) { nodes { name } } }
      }
    }
  }`;
const ADD_LABEL = `
  mutation ($item: ID!, $label: ID!) {
    addLabelsToLabelable(input: { labelableId: $item, labelIds: [$label] }) { clientMutationId }
  }`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Names and renames of .github/labels.yml, whose entries keep one quoted key per line.
function readManifest(text) {
  const names = new Set();
  const renames = new Map();
  let current;
  for (const line of text.split('\n')) {
    const match = line.match(/^(- name|  from_name): "(.*)"$/);
    if (!match) continue;
    if (match[1] === '- name') {
      current = match[2];
      names.add(current);
    } else {
      renames.set(match[2], current);
    }
  }
  return { names, renames };
}

// Whether the migration is still going on. It deletes the merged labels when it ends,
// so one left in the repository says it has not, whichever items carry it, or none.
// An old name the sync could not rename does not count: it stays until its
// `from_name` line goes.
const isMigrating = (repoLabels) => repoLabels.some((name) => MERGES[name]);

// The decision taken on an item: open issues and pull requests only.
const decisionFor = (item) => (item.state === 'open' && !item.discussion ? ITEMS[item.number] : undefined);

// Whether a decision removes this label from the item: a move must not add it back.
const removes = (item, label) => decisionFor(item)?.remove?.includes(label) ?? false;

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

// Every discussion of the repository, shaped like the issues of the REST API.
async function listDiscussions(github, { owner, repo }) {
  const discussions = [];
  let page;
  do {
    const { repository } = await github.graphql(DISCUSSIONS, { owner, repo, after: page?.pageInfo.endCursor });
    page = repository.discussions;
    for (const node of page.nodes) {
      discussions.push({
        discussion: true,
        node_id: node.id,
        number: node.number,
        state: node.closed ? 'closed' : 'open',
        created_at: node.createdAt,
        title: node.title,
        labels: node.labels.nodes,
      });
    }
  } while (page.pageInfo.hasNextPage);
  return discussions;
}

module.exports = async ({ github, context, dryRun, runTime = RUN_TIME }) => {
  const { owner, repo } = context.repo;
  const { renames } = readManifest(fs.readFileSync(MANIFEST, 'utf8'));
  // Old label → new label. A dry run comes before the sync, so it reads the labels as
  // renamed. A real run comes after it: an old name still there is one the sync could
  // not rename, and its items get the new label like those of a merge.
  const moves = dryRun ? Object.entries(MERGES) : [...Object.entries(MERGES), ...renames];
  const nameOf = (label) => (dryRun ? renames.get(label.name) ?? label.name : label.name);
  const carries = (item, name) => item.labels.some((label) => nameOf(label) === name);
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
    while (true) {
      const now = Date.now();
      while (writes.length && writes[0] <= now - HOUR) writes.shift();
      let until = now;
      if (remaining < RESERVE) until = Math.max(until, reset * 1000);
      if (writes.length >= MAX_WRITES) until = Math.max(until, writes[0] + HOUR);
      if (until <= now) return true;
      if (until >= stopAt) return false;
      // Once the hour is full, each write waits a moment for the oldest one to leave it.
      if (until - now >= 60 * 1000) {
        console.log(`Waiting ${Math.round((until - now) / 60000)} min for the rate limit`);
      }
      await sleep(until - now);
    }
  }

  // Sends a request. A rate limit answers 403 or 429, or, from GraphQL, 200 with the
  // error in the body: wait as GitHub asks, until the hourly budget is back when it is
  // spent, a minute at least, and try again, three times at most. Null when the wait
  // would outlast the run.
  async function request(call) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await call();
      } catch (error) {
        const rateLimited =
          ([403, 429].includes(error.status) || error.name === 'GraphqlResponseError') && /rate limit/i.test(error.message);
        if (!rateLimited || attempt === 3) throw error;
        // The error of a GraphQL body carries the headers itself.
        const headers = error.response?.headers ?? error.headers ?? {};
        const spent = headers['x-ratelimit-remaining'] === '0';
        const wait = Math.max(
          Number(headers['retry-after'] ?? 0) * 1000,
          spent ? headers['x-ratelimit-reset'] * 1000 - Date.now() : 0,
          60 * 1000
        );
        if (Date.now() + wait >= stopAt) return null;
        console.log(`Rate limited, waiting ${Math.ceil(wait / 60000)} min`);
        await sleep(wait);
      }
    }
  }

  // A read the run cannot wait for fails it: the old labels stay, and the next run
  // reads again.
  async function read(call) {
    const result = await request(call);
    if (result === null) throw new Error('Rate limited for longer than this run lasts');
    return result;
  }

  const list = (params) =>
    read(() => github.paginate(github.rest.issues.listForRepo, { owner, repo, per_page: 100, ...params }));

  // The items carrying the label: the issues and pull requests, listed by GitHub, then
  // the discussions, picked among those already read.
  const carrying = async (label, state) => [
    ...(await list({ labels: label, state })),
    ...discussions.filter(
      (item) => (state === 'all' || item.state === state) && item.labels.some(({ name }) => name === label)
    ),
  ];

  // Someone may have removed the label since the item was listed: GitHub answers 404,
  // and nothing is left to do.
  const removeLabel = (target, name) =>
    github.rest.issues.removeLabel({ ...target, name }).catch((error) => {
      if (error.status !== 404) throw error;
      return { headers: error.response?.headers ?? {} };
    });

  // Adds the label to the item, or removes it.
  async function change(item, label, remove = false) {
    const sign = remove ? '-' : '+';
    // An item can carry several old labels merging into the same new one.
    const key = `${item.number} ${sign} ${label}`;
    if (planned.has(key)) return;
    planned.add(key);
    let response = null;
    if (!dryRun && left === 0 && (await waitForBudget())) {
      const target = { owner, repo, issue_number: item.number };
      response = await request(() => {
        if (item.discussion) return github.graphql(ADD_LABEL, { item: item.node_id, label: labelIds.get(label) });
        return remove ? removeLabel(target, label) : github.rest.issues.addLabels({ ...target, labels: [label] });
      });
    }
    if (!response) {
      if (!dryRun && left === 0) {
        console.log('Stopping here: the next run does the rest');
      }
      left++;
      console.log(`#${item.number}: ${sign} ${label}`);
      return;
    }
    // An answer of the REST API tells what is left of its hourly budget.
    if (!item.discussion) {
      remaining = Number(response.headers['x-ratelimit-remaining'] ?? Infinity);
      reset = Number(response.headers['x-ratelimit-reset'] ?? 0);
    }
    writes.push(Date.now());
    applied++;
    // Stay under GitHub's secondary limit on write requests (80 per minute).
    await sleep(1000);
  }

  // Once a run stops, the next one takes over: no need to spend more requests.
  const stopped = () => !dryRun && left > 0;

  async function moveItems(state) {
    for (const [oldLabel, newLabel] of moves) {
      if (stopped()) return;
      for (const item of await carrying(oldLabel, state)) {
        if (!carries(item, newLabel) && !removes(item, newLabel)) {
          await change(item, newLabel);
        }
      }
    }
  }

  // The labels of the repository tell whether the migration is still going on, and the
  // discussions cannot be listed label by label. Both are read first, before anything
  // can stop the run.
  const repoLabels = await read(() =>
    github.paginate(github.rest.issues.listLabelsForRepo, { owner, repo, per_page: 100 })
  );
  const labelIds = new Map(repoLabels.map((label) => [label.name, label.node_id]));
  let discussions = await read(() => listDiscussions(github, context.repo));

  // Open items first (about 300 writes, minutes), then the history of closed ones.
  await moveItems('open');

  const open = await list({ state: 'open' });
  for (const item of open) {
    if (item.pull_request) continue;
    if (stopped()) break;
    if (isUntriaged(item)) {
      await change(item, NEEDS_TRIAGE);
    }
    if (isLegacy(item) && !(await read(() => hadLegacyLabel(github, context.repo, item)))) {
      await change(item, LEGACY_REVIEW);
    }
  }

  // The decisions belong to the migration: once it is over, these items are left to
  // the triagers.
  if (isMigrating(repoLabels.map((label) => label.name))) {
    for (const item of open) {
      const { add = [], remove = [] } = decisionFor(item) ?? {};
      for (const label of add) {
        if (!carries(item, label)) await change(item, label);
      }
      for (const label of remove) {
        if (carries(item, label)) await change(item, label, true);
      }
    }
  }

  await moveItems('closed');

  // Before the old labels are deleted, read them again, and the discussions with them:
  // every item still carrying one must already carry its new label.
  if (!dryRun && left === 0) {
    discussions = await read(() => listDiscussions(github, context.repo));
    for (const [oldLabel, newLabel] of moves) {
      for (const item of await carrying(oldLabel, 'all')) {
        if (!carries(item, newLabel) && !removes(item, newLabel)) {
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
  MANIFEST,
  MERGES,
  ITEMS,
  decisionFor,
  isMigrating,
  NEEDS_TRIAGE,
  LEGACY_REVIEW,
  readManifest,
  hadLegacyLabel,
  listDiscussions,
  isUntriaged,
  isLegacy,
});
