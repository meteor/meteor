/**
 * Migration to the labels of .github/labels.yml, run by .github/workflows/labels.yml.
 *
 * The sync renames the main old label of each new label (`from_name`). This script
 * covers what a rename cannot:
 * 1. Merges: every issue or PR carrying one of the old labels below gets the new one.
 * 2. Open issues without any `status:` label get `status: needs-triage`.
 *
 * It is idempotent and stays under the hourly API budget of the workflow token:
 * when the budget runs low it stops, and the next run picks up where it left off.
 * It returns the number of items still to label, so the workflow deletes the old
 * labels only once nothing is left.
 */
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
// Requests kept in reserve for the other workflows sharing the token budget.
const RESERVE = 200;

module.exports = async ({ github, context, dryRun }) => {
  const { owner, repo } = context.repo;
  const planned = new Set();
  let remaining = Infinity;
  let applied = 0;
  let left = 0;

  const list = (params) =>
    github.paginate(github.rest.issues.listForRepo, { owner, repo, per_page: 100, ...params });

  async function addLabel(item, label) {
    // An item can carry several old labels merging into the same new one.
    const key = `${item.number} ${label}`;
    if (planned.has(key)) return;
    planned.add(key);
    if (dryRun || remaining < RESERVE) {
      left++;
      console.log(`#${item.number}: + ${label}`);
      return;
    }
    const response = await github.rest.issues.addLabels({
      owner,
      repo,
      issue_number: item.number,
      labels: [label],
    });
    remaining = Number(response.headers['x-ratelimit-remaining'] ?? Infinity);
    applied++;
    // Stay under GitHub's secondary limit on write requests (80 per minute).
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  for (const [oldLabel, newLabel] of Object.entries(MERGES)) {
    for (const item of await list({ labels: oldLabel, state: 'all' })) {
      if (!item.labels.some((label) => label.name === newLabel)) {
        await addLabel(item, newLabel);
      }
    }
  }

  for (const item of await list({ state: 'open' })) {
    const untriaged = !item.labels.some(
      (label) =>
        (label.name.startsWith('status: ') && label.name !== STALE) ||
        OLD_STATUSES.includes(label.name)
    );
    if (!item.pull_request && untriaged) {
      await addLabel(item, NEEDS_TRIAGE);
    }
  }

  console.log(JSON.stringify({ applied, left, dryRun: Boolean(dryRun) }, null, 2));
  return left;
};

module.exports.MERGES = MERGES;
