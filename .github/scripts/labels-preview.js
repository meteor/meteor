/**
 * Preview of the label migration, run by .github/workflows/labels.yml before anything
 * changes. It lists every issue and pull request and writes:
 * - labels-before.json: the labels each item carries now, to compare with afterwards;
 * - labels-preview.csv: the items whose labels change, before and after;
 * - the job summary: the count of each move, and the cases to decide before applying.
 * It only reads the repository.
 */
const fs = require('fs');
const {
  MANIFEST,
  MERGES,
  NEEDS_TRIAGE,
  LEGACY_REVIEW,
  readManifest,
  hadLegacyLabel,
  isUntriaged,
  isLegacy,
} = require('./relabel.js');

// The labels an item carries once the sync and relabel.js are done. `reviewed` holds
// the numbers of the issues that already had a `legacy:` label, which relabel.js skips.
function migrate(item, { names, renames }, reviewed = new Set()) {
  const before = item.labels.map((label) => label.name);
  const after = new Set(before.map((name) => renames.get(name) ?? name));
  for (const name of before) {
    if (MERGES[name]) after.add(MERGES[name]);
  }
  if (item.state === 'open' && !item.pull_request) {
    if (isUntriaged(item)) after.add(NEEDS_TRIAGE);
    if (isLegacy(item) && !reviewed.has(item.number)) after.add(LEGACY_REVIEW);
  }
  return [...after].filter((name) => names.has(name)).sort();
}

const increment = (map, key, open) => {
  const count = map.get(key) ?? { all: 0, open: 0 };
  count.all++;
  if (open) count.open++;
  map.set(key, count);
};

// `repoLabels` are the names of the labels in the repository, to show the deletions
// of the labels no item carries.
function preview(items, manifest, { reviewed, repoLabels = [] } = {}) {
  const rows = [];
  const moves = new Map();
  const decide = { candidates: [], experiments: [], conflicts: [], prStatuses: [] };
  for (const item of items) {
    const before = item.labels.map((label) => label.name).sort();
    const after = migrate(item, manifest, reviewed);
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
    if (before.includes('Candidate 3.x.x')) decide.candidates.push(item);
    if (!open) continue;
    if (/experiment|proof of concept|\bpoc\b|prototype/i.test(item.title)) decide.experiments.push(item);
    for (const facet of ['type: ', 'status: ', 'priority: ']) {
      const values = after.filter((name) => name.startsWith(facet) && name !== 'status: stale');
      if (values.length > 1) decide.conflicts.push({ item, values });
    }
    if (item.pull_request && after.some((name) => name.startsWith('status: '))) decide.prStatuses.push(item);
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
  const list = (items) => items.map((item) => `- ${link(item)} ${item.state}: ${item.title}`).join('\n') || 'None.';
  const sorted = [...moves].sort(([a], [b]) => a.localeCompare(b));
  const table = sorted.map(([move, count]) => `| ${move} | ${count.all} | ${count.open} |`).join('\n');
  const dropped = sorted
    .filter(([move, count]) => move.endsWith('→ (deleted)') && count.open > 0)
    .map(([move, count]) => `- \`${move.replace(' → (deleted)', '')}\`: ${count.open} open of ${count.all}`);
  return [
    `## Label migration preview`,
    `${rows.length} items change. Every change is in the \`labels-preview\` artifact, next to the current labels.`,
    `| Move | Items | Open |\n|---|---|---|\n${table}`,
    `### To decide`,
    `**\`Candidate 3.x.x\` items**: keep \`priority: candidate\`, switch to \`experimental\`, or both.\n\n${list(decide.candidates)}`,
    `**Open items whose title reads like an experiment**: \`experimental\` may fit.\n\n${list(decide.experiments)}`,
    `**Open items with two values in a facet**:\n\n${
      decide.conflicts.map(({ item, values }) => `- ${link(item)}: ${values.join(', ')}`).join('\n') || 'None.'
    }`,
    `**Open pull requests with a status** (pull requests use GitHub's states):\n\n${list(decide.prStatuses)}`,
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
