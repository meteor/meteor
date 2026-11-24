// Tests for labels-preview.js using Node's built-in test runner (node:test)

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const writePreview = require('../labels-preview.js');
const { readManifest, migrate, preview, report } = writePreview;
const { MANIFEST, ITEMS } = require('../relabel.js');

const manifest = readManifest(fs.readFileSync(MANIFEST, 'utf8'));

const item = (number, labels, extra = {}) => ({
  number,
  state: 'closed',
  created_at: '2025-03-10T10:00:00Z',
  title: `Item ${number}`,
  labels: labels.map((name) => ({ name })),
  ...extra,
});

test('reads the names and the renames of a manifest', () => {
  const text = [
    '# type: exactly one per item',
    '- name: "type: bug"',
    '  color: "d73a4a"',
    '  description: "Something does not work"',
    '  from_name: "Type:Bug"',
    '- name: "experimental"',
    '  color: "d4c5f9"',
  ].join('\n');
  const { names, renames } = readManifest(text);
  assert.deepStrictEqual([...names], ['type: bug', 'experimental']);
  assert.deepStrictEqual([...renames], [['Type:Bug', 'type: bug']]);
});

test('renames, merges and deletes, and keeps the labels already in the manifest', () => {
  assert.deepStrictEqual(migrate(item(1, ['Type:Bug', 'Project:CSS', 'Project:NPM', 'help wanted']), manifest), [
    'area: build',
    'help wanted',
    'type: bug',
  ]);
  // A merge into a label the item already carries adds nothing.
  assert.deepStrictEqual(migrate(item(2, ['bug', 'type: bug']), manifest), ['type: bug']);
});

test('adds the triage and legacy labels to open issues only', () => {
  const old = '2023-05-02T10:00:00Z';
  assert.deepStrictEqual(migrate(item(1, [], { state: 'open', created_at: old }), manifest), [
    'legacy: needs-review',
    'status: needs-triage',
  ]);
  assert.deepStrictEqual(migrate(item(2, [], { created_at: old }), manifest), []);
  assert.deepStrictEqual(migrate(item(3, [], { state: 'open', created_at: old, pull_request: {} }), manifest), []);
  assert.deepStrictEqual(migrate(item(6, [], { state: 'open', created_at: old, discussion: true }), manifest), []);
  // A status, old name or new, counts as triaged; `idle` alone does not.
  assert.deepStrictEqual(migrate(item(4, ['confirmed'], { state: 'open' }), manifest), ['status: confirmed']);
  assert.deepStrictEqual(migrate(item(5, ['idle'], { state: 'open' }), manifest), [
    'status: needs-triage',
    'status: stale',
  ]);
});

test('lists the moves and the cases to check', () => {
  const result = preview(
    [
      item(1, ['Candidate 3.x.x']),
      item(2, ['Severity:production', 'Next 3.x.x', 'confirmed'], { state: 'open' }),
      item(3, ['Severity:has-workaround', 'confirmed'], { state: 'open', title: 'Experiment with a new driver' }),
      item(4, ['ready'], { state: 'open', pull_request: {} }),
      item(5, ['help wanted']),
      item(6, ['Impact:most', 'priority: low'], { title: 'Experiment' }),
      item(7, ['ready'], { pull_request: {}, title: 'PoC' }),
      item(8, ['confirmed'], { state: 'open', title: 'PoC of a cache' }),
      item(9, ['confirmed'], { state: 'open', title: 'Epoch dates drift' }),
      item(10, ['Impact:few', 'confirmed', 'experimental'], { state: 'open', title: 'Prototype of a cache' }),
    ],
    manifest
  );
  assert.deepStrictEqual(result.rows.map((row) => row.number), [1, 2, 3, 4, 6, 7, 8, 9, 10]);
  assert.deepStrictEqual(result.moves.get('Impact:few → (deleted)'), { all: 1, open: 1 });
  assert.deepStrictEqual(result.moves.get('Severity:has-workaround → (deleted)'), { all: 1, open: 1 });
  // #10 already carries `experimental`.
  assert.deepStrictEqual(result.decide.experiments.map(({ number }) => number), [3, 8]);
  assert.deepStrictEqual(result.decide.conflicts, [
    { item: result.decide.conflicts[0].item, values: ['priority: critical', 'priority: next'] },
  ]);
  assert.deepStrictEqual(result.decide.prStatuses.map(({ number }) => number), [4]);
  assert.match(report(result, 'https://github.com/meteor/meteor'), /- `Severity:has-workaround`: 1 open of 1/);
});

test('previews the discussions with the issues and the pull requests', () => {
  const result = preview(
    [
      item(1, ['Project:Server Performance'], { state: 'open' }),
      // https://github.com/meteor/meteor/discussions/13823, and a closed one.
      item(13823, ['Project:Server Performance'], { state: 'open', discussion: true }),
      item(11633, ['confirmed', 'not-ready', 'Project:Apple'], { discussion: true }),
      item(11696, ['Project:NPM'], { state: 'open', discussion: true }),
      item(2, ['good first issue'], { state: 'open', discussion: true }),
    ],
    manifest
  );
  assert.deepStrictEqual(result.rows.map((row) => [row.number, row.kind, row.after]), [
    [1, 'issue', ['area: webapp', 'status: needs-triage']],
    [13823, 'discussion', ['area: webapp']],
    [11633, 'discussion', ['area: mobile', 'status: confirmed', 'status: needs-info']],
    [11696, 'discussion', []],
  ]);
  assert.deepStrictEqual(result.moves.get('Project:Server Performance → area: webapp'), { all: 2, open: 2 });
  assert.deepStrictEqual(result.moves.get('Project:NPM → (deleted)'), { all: 1, open: 1 });
  assert.match(
    report(result, 'https://github.com/meteor/meteor'),
    /end without an area\*\*:\n\n- \[#11696\]\(https:\/\/github.com\/meteor\/meteor\/discussions\/11696\) Item 11696\n/
  );
});

test('lists the open items of each priority, and `Impact:few` or `Impact:some` give none', () => {
  const result = preview(
    [
      item(1, ['Severity:production', 'Impact:few'], { state: 'open' }),
      item(2, ['Impact:few', 'Next 3.x.x'], { state: 'open' }),
      item(3, ['Impact:few', 'Impact:some'], { state: 'open' }),
      item(4, ['Impact:most']),
      item(5, ['Candidate 3.x.x'], { state: 'open', pull_request: {} }),
      item(6, ['Severity:production', 'Next 3.x.x'], { state: 'open' }),
    ],
    manifest
  );
  const listed = (name) => result.decide.priorities.get(name).map(({ number }) => number);
  // #6 has two priorities and shows under both.
  assert.deepStrictEqual(listed('priority: critical'), [1, 6]);
  assert.deepStrictEqual(listed('priority: next'), [2, 6]);
  assert.deepStrictEqual(listed('priority: candidate'), [5]);
  assert.deepStrictEqual(listed('priority: low'), []);
  assert.ok([...result.decide.priorities.keys()].every((name) => name.startsWith('priority: ')));
  const text = report(result, 'https://github.com/meteor/meteor');
  assert.match(text, /\*\*`priority: candidate`\*\* \(1\)\n\n- \[#5\]\(https:\/\/github.com\/meteor\/meteor\/issues\/5\) Item 5\n/);
  assert.match(text, /\*\*`priority: low`\*\* \(0\)\n\nNone\./);
});

test('applies the decisions on single open items while a merged label is left in the repository', () => {
  // Two entries of ITEMS in relabel.js.
  const cve = (extra) => item(14825, ['confirmed', 'Type:Bug', 'Candidate 3.x.x', 'Impact:most'], extra);
  const installer = (labels) => item(14586, labels, { state: 'open', pull_request: {} });
  const decided = ['priority: critical', 'status: confirmed', 'type: security'];
  assert.deepStrictEqual(migrate(cve({ state: 'open' }), manifest), decided);
  // Closed, it keeps what the renames give it.
  assert.deepStrictEqual(migrate(cve(), manifest), [
    'priority: candidate',
    'priority: critical',
    'status: confirmed',
    'type: bug',
  ]);

  const result = preview(
    [
      cve({ state: 'open' }),
      installer(['Project:NPM']),
      item(3, ['help wanted']),
      // Two more entries of ITEMS: a pull request merged since, and an experiment.
      item(14889, ['Project:NPM'], { pull_request: {} }),
      item(14479, ['Project:Tool'], { state: 'open', pull_request: {}, title: '[Experimental] E2E smart triggering' }),
    ],
    manifest,
    { repoLabels: ['confirmed', 'Type:Bug', 'Candidate 3.x.x', 'Impact:most', 'Project:NPM', 'help wanted', 'Project:Tool'] }
  );
  assert.deepStrictEqual(result.rows.map((row) => [row.number, row.after]), [
    [14825, decided],
    [14586, ['area: cli']],
    [14889, []],
    [14479, ['area: cli', 'experimental']],
  ]);
  assert.deepStrictEqual(result.decide.items.map(({ number }) => number), [14825, 14586, 14479]);
  // The decisions name issues and pull requests: a discussion gets none.
  const discussed = preview([item(14586, ['Project:NPM'], { state: 'open', discussion: true })], manifest, {
    repoLabels: ['Project:NPM', 'bug'],
  });
  assert.deepStrictEqual(discussed.rows.map((row) => row.after), [[]]);
  assert.deepStrictEqual(discussed.decide.items, []);
  // The lists of the summary follow the decisions.
  assert.deepStrictEqual(result.decide.priorities.get('priority: candidate'), []);
  assert.deepStrictEqual(result.decide.priorities.get('priority: critical').map(({ number }) => number), [14825]);
  assert.deepStrictEqual([result.decide.conflicts, result.decide.experiments, result.decide.noArea], [[], [], []]);
  const text = report(result, 'https://github.com/meteor/meteor');
  assert.match(text, /Item 14825: adds `type: security`; removes `type: bug`, `priority: candidate`\n/);
  assert.match(text, /Item 14586: adds `area: cli`\n/);

  // The last open item with a merged label was closed since: the label is still in the
  // repository, so the decisions still apply.
  const resumed = preview([installer(['Project:NPM']), item(3, ['bug'])], manifest, { repoLabels: ['Project:NPM', 'bug'] });
  assert.deepStrictEqual(resumed.rows.map((row) => [row.number, row.after]), [
    [14586, ['area: cli']],
    [3, ['type: bug']],
  ]);
  assert.deepStrictEqual(resumed.decide.items.map(({ number }) => number), [14586]);
  // The same when no item carries it any more and it is not deleted yet.
  const unused = preview([installer(['Project:NPM'])], manifest, { repoLabels: ['Project:NPM', 'bug'] });
  assert.deepStrictEqual(unused.rows.map((row) => [row.number, row.after]), [[14586, ['area: cli']]]);

  // Once the merged labels are gone from the repository, the decisions no longer apply,
  // whatever other label remains: one from outside the manifest, or an old name the
  // sync could not rename.
  const later = preview(
    [
      installer([]),
      item(4, ['github_actions', 'dependencies'], { state: 'open', pull_request: {} }),
      item(5, ['Type:Bug', 'type: bug'], { state: 'open', pull_request: {} }),
    ],
    manifest,
    { repoLabels: ['github_actions', 'dependencies', 'Type:Bug', 'type: bug'] }
  );
  assert.deepStrictEqual(later.rows.map((row) => row.number), [4, 5]);

  // Afterwards the item keeps what people put back, and an old name the sync could not
  // rename still does not give back a label that the decision removed.
  const kept = cve({ state: 'open' });
  kept.labels = ['status: confirmed', 'priority: critical', 'type: security', 'priority: candidate', 'Type:Bug'].map(
    (name) => ({ name })
  );
  assert.deepStrictEqual(migrate(kept, manifest, new Set(), false), [
    'priority: candidate',
    'priority: critical',
    'status: confirmed',
    'type: security',
  ]);
  assert.deepStrictEqual(later.decide.items, []);
  assert.match(report(later, 'https://github.com/meteor/meteor'), /while the migration lasts:\n\nNone\./);
});

// The labels of the items named in the decisions, on November 19, 2026, and the labels
// they must end with, the latter as in labels-preview.csv. #14397 was closed the day
// after, and `Next 3.x.x` was removed from it: of its two priorities it keeps
// `priority: critical`.
const DECIDED = [
  [10903, 'issue', '2020-02-08', 'confirmed; Project:NPM; Impact:few; in-discussion; idle; modern-build-stack; Next 3.x.x',
    'area: rspack; legacy: needs-review; priority: next; status: confirmed; status: in-discussion; status: stale'],
  [11030, 'issue', '2020-04-27', 'confirmed; Project:NPM; idle',
    'area: build; legacy: needs-review; status: confirmed; status: stale'],
  [12329, 'issue', '2022-11-29', 'Project:NPM; good first issue; idle',
    'area: build; good first issue; legacy: needs-review; status: needs-triage; status: stale'],
  [13436, 'issue', '2024-10-30', 'Project:NPM; waiting-feedback; hacktoberfest; idle; modern-build-stack; Next 3.x.x',
    'area: build; area: rspack; help wanted; priority: next; status: needs-info; status: stale'],
  [13597, 'issue', '2025-02-01', 'Project:NPM; idle', 'area: build; status: needs-triage; status: stale'],
  [13802, 'pr', '2025-06-22', 'Project:NPM', 'area: build'],
  [13936, 'pr', '2025-09-19', 'Project:NPM; hacktoberfest-accepted', 'area: build; hacktoberfest-accepted'],
  [14218, 'pr', '2026-03-11', 'Project:Isobuild:Minifiers; Project:JS Environment; Project:Tool; Project:Isobuild; Project:Tool:Shell',
    'area: build; area: cli; experimental'],
  [14279, 'pr', '2026-03-28', 'Project:Docs; Candidate 3.x.x', 'area: docs; priority: candidate'],
  [14286, 'pr', '2026-03-30', 'Project:Mongo Driver; Candidate 3.x.x', 'area: mongo; priority: candidate'],
  [14299, 'pr', '2026-04-01', 'Project:Docs; Project:Guide; Candidate 3.x.x', 'area: docs; priority: candidate'],
  [14397, 'issue', '2026-05-01',
    'confirmed; Project:Isobuild; Type:Bug; Severity:has-workaround; Severity:production; Impact:some; modern-build-stack',
    'area: build; area: rspack; priority: critical; status: confirmed; type: bug'],
  [14429, 'pr', '2026-05-24', 'Project:Docs; Project:Tool; Project:Isobuild; Candidate 3.x.x',
    'area: build; area: cli; area: docs; priority: candidate'],
  [14479, 'pr', '2026-06-22', 'Project:Tool', 'area: cli; experimental'],
  [14586, 'pr', '2026-07-14', 'Project:NPM', 'area: cli'],
  [14615, 'pr', '2026-07-28', 'Project:NPM', 'area: cli'],
  [14625, 'pr', '2026-07-28', 'Project:NPM', 'area: cli'],
  [14744, 'issue', '2026-09-12', 'confirmed; Type:Bug; Severity:production; Impact:few; modern-build-stack',
    'area: rspack; priority: critical; status: confirmed; type: bug'],
  [14751, 'pr', '2026-09-13',
    'Project:DDP; Project:Mongo Driver; Project:Isobuild:Minifiers; Project:JS Environment; Project:Tool; Project:Isobuild; ' +
      'Project:Release Process; Project:JS Environment:Typescript; Candidate 3.x.x',
    'area: build; area: cli; area: ddp; area: mongo; area: release; area: types; experimental; priority: candidate'],
  [14795, 'issue', '2026-09-25', 'confirmed; Project:Livequery; Type:Bug; Severity:has-workaround; Severity:production; Impact:few',
    'area: livequery; priority: critical; status: confirmed; type: bug'],
  [14796, 'pr', '2026-09-25', 'Project:NPM', 'area: cli; area: rspack'],
  [14825, 'issue', '2026-10-08',
    'confirmed; Project:Webapp; Project:Tool; Project:NPM; Type:Bug; Severity:has-workaround; Impact:most; Candidate 3.x.x',
    'area: cli; area: webapp; priority: critical; status: confirmed; type: security'],
  [14886, 'pr', '2026-10-30', 'Project:NPM', 'area: rspack'],
  [14889, 'pr', '2026-10-30', 'Project:NPM', 'area: mobile'],
];

test('the items named in the decisions end with the labels chosen for them', () => {
  for (const [number, kind, createdAt, before, after] of DECIDED) {
    const named = item(number, before.split('; '), {
      state: 'open',
      created_at: createdAt,
      pull_request: kind === 'pr' ? {} : undefined,
    });
    assert.deepStrictEqual(migrate(named, manifest), after.split('; '), `#${number}`);
  }
  // Every entry of ITEMS is in the table.
  assert.deepStrictEqual(
    Object.keys(ITEMS).filter((number) => !DECIDED.some(([named]) => named === Number(number))),
    []
  );
});

test('lists the open items a deleted `Project:` label leaves without an area', () => {
  const result = preview(
    [
      item(1, ['Project:NPM'], { state: 'open', pull_request: {} }),
      item(2, ['Project:NPM', 'Project:Tool'], { state: 'open', pull_request: {} }),
      item(3, ['Project:NPM']),
      item(4, ['confirmed'], { state: 'open' }),
      item(14586, ['Project:NPM'], { state: 'open', pull_request: {} }),
      item(5, ['bug'], { state: 'open' }),
      // Renamed to `platform: windows`: no area, but nothing is lost.
      item(6, ['Project:Windows'], { state: 'open' }),
    ],
    manifest,
    { repoLabels: ['Project:NPM', 'Project:Tool', 'confirmed', 'bug', 'Project:Windows'] }
  );
  assert.deepStrictEqual(result.decide.noArea.map(({ number }) => number), [1]);
  assert.match(report(result, 'https://github.com/meteor/meteor'), /end without an area\*\*:\n\n- \[#1\]\([^)]+\) Item 1\n/);
});

test('flags two values in the type and status facets, ignoring status: stale', () => {
  const result = preview(
    [
      item(1, ['Type:Bug', 'missing-docs'], { state: 'open', title: 'Proof of concept: streaming' }),
      item(2, ['confirmed', 'ready'], { state: 'open', title: 'Prototype a new router' }),
      item(3, ['idle', 'confirmed'], { state: 'open', title: 'Epoch dates drift' }),
    ],
    manifest
  );
  assert.deepStrictEqual(
    result.decide.conflicts.map(({ item, values }) => [item.number, values]),
    [
      [1, ['type: bug', 'type: docs']],
      [2, ['status: confirmed', 'status: ready']],
    ]
  );
});

test('counts each move once, open items apart', () => {
  const { moves } = preview(
    [
      item(1, ['Candidate 3.x.x', 'help wanted']),
      item(2, ['triage'], { state: 'open' }),
      item(3, ['status: needs-triage'], { state: 'open' }),
      item(4, [], { state: 'open' }),
    ],
    manifest
  );
  assert.deepStrictEqual(Object.fromEntries(moves), {
    'Candidate 3.x.x → priority: candidate': { all: 1, open: 0 },
    'triage → status: needs-triage': { all: 1, open: 1 },
    '(none) → status: needs-triage': { all: 1, open: 1 },
  });
});

test('lists only deleted labels that remain on open items', () => {
  const text = report(
    preview(
      [
        item(1, ['Severity:has-workaround'], { state: 'open' }),
        item(2, ['Severity:has-workaround']),
        item(3, ['Project:NPM']),
        item(4, ['Impact:most'], { state: 'open' }),
      ],
      manifest
    ),
    'https://github.com/meteor/meteor'
  );
  assert.match(text, /with no new label:\n\n- `Severity:has-workaround`: 1 open of 2$/);
});

test('shows the deletion of a label no item carries, and skips the issues already reviewed', () => {
  const old = '2023-05-02T10:00:00Z';
  const result = preview([item(1, [], { state: 'open', created_at: old }), item(2, ['spam'])], manifest, {
    reviewed: new Set([1]),
    repoLabels: ['tip', 'spam', 'Type:Bug', 'bug', 'help wanted'],
  });
  assert.deepStrictEqual(Object.fromEntries(result.moves), {
    '(none) → status: needs-triage': { all: 1, open: 1 },
    'spam → (deleted)': { all: 1, open: 0 },
    'tip → (deleted)': { all: 0, open: 0 },
  });
});

test('exports the current labels and writes the preview', async () => {
  const items = [
    item(1, ['Type:Bug', 'confirmed'], { state: 'open', created_at: '2023-05-02T10:00:00Z' }),
    item(2, ['Type:Bug'], { state: 'open', created_at: '2023-05-02T10:00:00Z', pull_request: {} }),
    item(3, ['help wanted']),
  ];
  const discussions = [
    { id: 'D_4', number: 4, title: 'Item 4', closed: false, createdAt: '2023-05-02T10:00:00Z', labels: { nodes: [{ name: 'bug' }] } },
    { id: 'D_5', number: 5, title: 'Item 5', closed: true, createdAt: '2025-03-10T10:00:00Z', labels: { nodes: [] } },
  ];
  const github = {
    rest: { issues: { listForRepo: 'items', listEvents: 'events', listLabelsForRepo: 'labels' } },
    paginate: async (method, params) => {
      if (method === 'items') return params.state === 'all' ? items : [];
      // Issue 1 already had the legacy label once. A discussion has no issue history.
      if (method === 'events') {
        if (params.issue_number !== 1) throw Object.assign(new Error('Not Found'), { status: 404 });
        return [{ event: 'labeled', label: { name: 'legacy: needs-review' } }];
      }
      return [{ name: 'Type:Bug' }, { name: 'confirmed' }, { name: 'help wanted' }, { name: 'tip' }, { name: 'bug' }];
    },
    // One discussion per page.
    graphql: async (query, { after = 0 }) => ({
      repository: {
        discussions: { pageInfo: { hasNextPage: after + 1 < discussions.length, endCursor: after + 1 }, nodes: [discussions[after]] },
      },
    }),
  };
  let summary;
  const core = {
    summary: {
      addRaw(text) {
        summary = text;
        return this;
      },
      write: async () => {},
    },
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'labels-preview-'));
  const cwd = process.cwd();
  process.chdir(directory);
  try {
    await writePreview({ github, context: { repo: { owner: 'meteor', repo: 'meteor' } }, core });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync('labels-before.json', 'utf8'))[0], {
      number: 1,
      pull_request: false,
      discussion: false,
      state: 'open',
      created_at: '2023-05-02T10:00:00Z',
      title: 'Item 1',
      labels: ['Type:Bug', 'confirmed'],
    });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync('labels-before.json', 'utf8')).slice(3), [
      { number: 4, pull_request: false, discussion: true, state: 'open', created_at: '2023-05-02T10:00:00Z', title: 'Item 4', labels: ['bug'] },
      { number: 5, pull_request: false, discussion: true, state: 'closed', created_at: '2025-03-10T10:00:00Z', title: 'Item 5', labels: [] },
    ]);
    assert.deepStrictEqual(fs.readFileSync('labels-preview.csv', 'utf8').split('\n'), [
      'number,kind,state,before,after',
      '"1","issue","open","Type:Bug; confirmed","status: confirmed; type: bug"',
      '"2","pr","open","Type:Bug","type: bug"',
      '"4","discussion","open","bug","type: bug"',
    ]);
    assert.match(summary, /^## Label migration preview\n\n3 items change\./);
    assert.match(summary, /\| tip → \(deleted\) \| 0 \| 0 \|/);
  } finally {
    process.chdir(cwd);
    fs.rmSync(directory, { recursive: true });
  }
});
