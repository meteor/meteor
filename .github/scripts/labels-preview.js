/**
 * Preview of the label migration, run by .github/workflows/labels.yml before anything
 * changes. It lists every issue and pull request and writes:
 * - labels-before.json: the labels each item carries now, to compare with afterwards;
 * - labels-preview.csv: the items whose labels change, before and after;
 * - the job summary: the count of each move, the items decided one by one, the open
 *   items of each priority, and the cases to check before applying.
 * It only reads the repository.
 */
const fs = require('fs');
const {
  MANIFEST,
  MERGES,
  ITEMS,
  isMigrating,
  NEEDS_TRIAGE,
  LEGACY_REVIEW,
  readManifest,
  hadLegacyLabel,
  isUntriaged,
  isLegacy,
} = require('./relabel.js');

// The labels an item carries once the sync and relabel.js are done. `reviewed` holds
// the numbers of the issues that already had a `legacy:` label, which relabel.js skips.
// `migrating` says whether the decisions on single items still apply. A label that
// a decision removes never comes back from a rename or a merge: afterwards the item
// has it only if someone put it back.
function migrate(item, { names, renames }, reviewed = new Set(), migrating = true) {
  const before = item.labels.map((label) => label.name);
  const after = new Set(before.map((name) => renames.get(name) ?? name));
  for (const name of before) {
    if (MERGES[name]) after.add(MERGES[name]);
  }
  if (item.state === 'open' && !item.pull_request) {
    if (isUntriaged(item)) after.add(NEEDS_TRIAGE);
    if (isLegacy(item) && !reviewed.has(item.number)) after.add(LEGACY_REVIEW);
  }
  if (item.state === 'open') {
    const { add = [], remove = [] } = ITEMS[item.number] ?? {};
    if (migrating) {
      for (const name of add) after.add(name);
    }
    for (const name of remove) {
      if (migrating || !before.includes(name)) after.delete(name);
    }
  }
  return [...after].filter((name) => names.has(name)).sort();
}

const increment = (map, key, open) => {
  const count = map.get(key) ?? { all: 0, open: 0 };
  count.all++;
  if (open) count.open++;
  map.set(key, count);
};

// `repoLabels` are the names of the labels in the repository: they tell whether the
// migration is still going on, and show the deletions of the labels no item carries.
function preview(items, manifest, { reviewed, repoLabels = [] } = {}) {
  const rows = [];
  const moves = new Map();
  const priorities = new Map();
  for (const name of manifest.names) {
    if (name.startsWith('priority: ')) priorities.set(name, []);
  }
  const decide = { items: [], priorities, experiments: [], conflicts: [], prStatuses: [], noArea: [] };
  // As in relabel.js, the decisions on single items apply while the migration lasts.
  const migrating = isMigrating(repoLabels);
  for (const item of items) {
    const before = item.labels.map((label) => label.name).sort();
    const after = migrate(item, manifest, reviewed, migrating);
    const open = item.state === 'open';
    if (before.join() !== after.join()) {
      rows.push({ number: item.number, pr: Boolean(item.pull_request), state: item.state, before, after });
    }
    for (const name of before) {
      const target = manifest.renames.get(name) ?? MERGES[name] ?? (manifest.names.has(name) ? null : '(deleted)');
      if (target) increment(moves, `${name} → ${target}`, open);
    }
    for (const name of [NEEDS_TRIAGE, LEGACY_REVIEW]) {
      if (after.includes(name) && !before.includes(name) && !before.some((old) => manifest.renames.get(old) === name)) {
        increment(moves, `(none) → ${name}`, open);
      }
    }
    if (!open) continue;
    if (migrating && ITEMS[item.number]) decide.items.push(item);
    for (const name of after) priorities.get(name)?.push(item);
    if (/experiment|proof of concept|\bpoc\b|prototype/i.test(item.title) && !after.includes('experimental')) {
      decide.experiments.push(item);
    }
    for (const facet of ['type: ', 'status: ', 'priority: ']) {
      const values = after.filter((name) => name.startsWith(facet) && name !== 'status: stale');
      if (values.length > 1) decide.conflicts.push({ item, values });
    }
    if (item.pull_request && after.some((name) => name.startsWith('status: '))) decide.prStatuses.push(item);
    // `Project:` was the prefix of the areas: one that is not renamed can leave an item without any.
    const dropped = (name) => name.startsWith('Project:') && !manifest.renames.has(name);
    if (before.some(dropped) && !after.some((name) => name.startsWith('area: '))) decide.noArea.push(item);
  }
  for (const name of repoLabels) {
    const key = `${name} → (deleted)`;
    if (!manifest.names.has(name) && !manifest.renames.has(name) && !MERGES[name] && !moves.has(key)) {
      moves.set(key, { all: 0, open: 0 });
    }
  }
  return { rows, moves, decide };
}

// Markdown for the job summary.
function report({ rows, moves, decide }, repoUrl) {
  const link = (item) => `[#${item.number}](${repoUrl}/issues/${item.number})`;
  const list = (items) => items.map((item) => `- ${link(item)} ${item.title}`).join('\n') || 'None.';
  const code = (names) => names.map((name) => `\`${name}\``).join(', ');
  const sorted = [...moves].sort(([a], [b]) => a.localeCompare(b));
  const table = sorted.map(([move, count]) => `| ${move} | ${count.all} | ${count.open} |`).join('\n');
  const dropped = sorted
    .filter(([move, count]) => move.endsWith('→ (deleted)') && count.open > 0)
    .map(([move, count]) => `- \`${move.replace(' → (deleted)', '')}\`: ${count.open} open of ${count.all}`);
  const decided = decide.items.map((item) => {
    const { add = [], remove = [] } = ITEMS[item.number];
    const changes = [add.length && `adds ${code(add)}`, remove.length && `removes ${code(remove)}`];
    return `- ${link(item)} ${item.title}: ${changes.filter(Boolean).join('; ')}`;
  });
  const priorities = [...decide.priorities].map(([name, items]) => `**\`${name}\`** (${items.length})\n\n${list(items)}`);
  return [
    `## Label migration preview`,
    `${rows.length} items change. Every change is in the \`labels-preview\` artifact, next to the current labels.`,
    `| Move | Items | Open |\n|---|---|---|\n${table}`,
    `### Decided item by item`,
    `On top of the moves above, while the migration lasts:\n\n${decided.join('\n') || 'None.'}`,
    `### Open items by priority`,
    priorities.join('\n\n'),
    `### To check`,
    `**Open items whose title reads like an experiment**: \`experimental\` may fit.\n\n${list(decide.experiments)}`,
    `**Open items with two values in a facet**:\n\n${
      decide.conflicts.map(({ item, values }) => `- ${link(item)}: ${values.join(', ')}`).join('\n') || 'None.'
    }`,
    `**Open pull requests with a status** (pull requests use GitHub's states):\n\n${list(decide.prStatuses)}`,
    `**Open items that lose a \`Project:\` label and end without an area**:\n\n${list(decide.noArea)}`,
    `**Deleted labels still on open items**, with no new label:\n\n${dropped.join('\n') || 'None.'}`,
  ].join('\n\n');
}

const csvCell = (value) => `"${String(value).replace(/"/g, '""')}"`;

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const items = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'all', per_page: 100 });
  const reviewed = new Set();
  for (const item of items) {
    if (item.state === 'open' && !item.pull_request && isLegacy(item) && (await hadLegacyLabel(github, context.repo, item))) {
      reviewed.add(item.number);
    }
  }
  const repoLabels = await github.paginate(github.rest.issues.listLabelsForRepo, { owner, repo, per_page: 100 });
  const result = preview(items, readManifest(fs.readFileSync(MANIFEST, 'utf8')), {
    reviewed,
    repoLabels: repoLabels.map((label) => label.name),
  });
  const exported = items.map((item) => ({
    number: item.number,
    pull_request: Boolean(item.pull_request),
    state: item.state,
    created_at: item.created_at,
    title: item.title,
    labels: item.labels.map((label) => label.name),
  }));
  fs.writeFileSync('labels-before.json', JSON.stringify(exported));
  fs.writeFileSync(
    'labels-preview.csv',
    ['number,kind,state,before,after']
      .concat(result.rows.map((row) =>
        [row.number, row.pr ? 'pr' : 'issue', row.state, row.before.join('; '), row.after.join('; ')].map(csvCell).join(',')
      ))
      .join('\n')
  );
  await core.summary.addRaw(report(result, `https://github.com/${owner}/${repo}`)).write();
};

Object.assign(module.exports, { readManifest, migrate, preview, report });
