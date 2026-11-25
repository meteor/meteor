/**
 * Labels what the sync of .github/labels.yml leaves out, run by
 * .github/workflows/labels.yml.
 *
 * The sync creates the labels and renames the ones with a `from_name` line. This
 * script covers the rest:
 * 1. An old label the sync could not rename, because its new name already existed:
 *    every issue, pull request or discussion carrying it gets the new one, open items
 *    first, closed ones last.
 * 2. Open issues without any `status:` label get `status: needs-triage`.
 * 3. Open issues opened before Meteor 3.0 shipped, feature requests aside, get
 *    `legacy: needs-review`, once: an issue that ever had a `legacy:` label is
 *    skipped, so a triager who removed it after a check on 3.x keeps it removed.
 *
 * It is idempotent and stays under the hourly limits of the workflow token: when
 * one is reached it waits for it to clear and goes on, so one run labels the whole
 * repository. Close to the job's time limit it stops, and the next run picks up
 * where it left off.
 * It returns 0 when nothing is left to label: after a complete run it lists the old
 * labels again and counts every item still missing its new label. The workflow deletes
 * the labels missing from the manifest only then. An old label named by a `from_name`
 * line is not one of them: it stays until that line is removed, after a run that
 * returned 0. A run that stopped returns a number above 0, which is not the count of
 * what remains.
 */
const fs = require('fs');
const path = require('path');

const NEEDS_TRIAGE = 'status: needs-triage';
// `status: stale` says nothing about triage, so it does not count as a status here.
const STALE = 'status: stale';
const LEGACY_REVIEW = 'legacy: needs-review';
// Meteor 3.0 shipped on July 15, 2024.
const METEOR_3 = '2024-07-15';
// A feature request is not tied to a release.
const FEATURE = 'type: feature';
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

// An open issue without a status says nobody triaged it yet.
const isUntriaged = (item) => !item.labels.some((label) => label.name.startsWith('status: ') && label.name !== STALE);

// Opened before 3.0, not a feature request, never reviewed.
const isLegacy = (item) =>
  item.created_at < METEOR_3 &&
  !item.labels.some((label) => label.name.startsWith('legacy: ') || label.name === FEATURE);

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

module.exports = async ({ github, context, dryRun, runTime = RUN_TIME, manifest = fs.readFileSync(MANIFEST, 'utf8') }) => {
  const { owner, repo } = context.repo;
  const { renames } = readManifest(manifest);
  // Old label → new label. A dry run comes before the sync, so it has nothing to move.
  // A real run comes after it: an old name still there is one the sync could not
  // rename, and its items get the new label.
  const moves = dryRun ? [] : [...renames];
  // The triage reads an old name as its new label: the item gets it from the rename,
  // or from the move.
  const renamed = (item) => ({ ...item, labels: item.labels.map(({ name }) => ({ name: renames.get(name) ?? name })) });
  const carries = (item, name) => item.labels.some((label) => label.name === name);
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

  // Adds the label to the item.
  async function change(item, label) {
    let response = null;
    if (!dryRun && left === 0 && (await waitForBudget())) {
      response = await request(() => {
        if (item.discussion) return github.graphql(ADD_LABEL, { item: item.node_id, label: labelIds.get(label) });
        return github.rest.issues.addLabels({ owner, repo, issue_number: item.number, labels: [label] });
      });
    }
    if (!response) {
      if (!dryRun && left === 0) {
        console.log('Stopping here: the next run does the rest');
      }
      left++;
      console.log(`#${item.number}: + ${label}`);
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
        if (!carries(item, newLabel)) {
          await change(item, newLabel);
        }
      }
    }
  }

  // A discussion is labelled by the id of the label, and the discussions cannot be
  // listed label by label. Both are read first, before anything can stop the run.
  const repoLabels = await read(() =>
    github.paginate(github.rest.issues.listLabelsForRepo, { owner, repo, per_page: 100 })
  );
  const labelIds = new Map(repoLabels.map((label) => [label.name, label.node_id]));
  let discussions = await read(() => listDiscussions(github, context.repo));

  // Open items first, then the history of closed ones.
  await moveItems('open');

  const open = await list({ state: 'open' });
  for (const item of open.map(renamed)) {
    if (item.pull_request) continue;
    if (stopped()) break;
    if (isUntriaged(item)) {
      await change(item, NEEDS_TRIAGE);
    }
    if (isLegacy(item) && !(await read(() => hadLegacyLabel(github, context.repo, item)))) {
      await change(item, LEGACY_REVIEW);
    }
  }

  await moveItems('closed');

  // Before saying that nothing is left, read the old labels again, and the discussions
  // with them: every item still carrying one must already carry its new label.
  if (!dryRun && left === 0) {
    discussions = await read(() => listDiscussions(github, context.repo));
    for (const [oldLabel, newLabel] of moves) {
      for (const item of await carrying(oldLabel, 'all')) {
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
  MANIFEST,
  NEEDS_TRIAGE,
  LEGACY_REVIEW,
  readManifest,
  hadLegacyLabel,
  listDiscussions,
  isUntriaged,
  isLegacy,
});
