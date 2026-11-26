// Tests for labels-preview.js using Node's built-in test runner (node:test)

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const writePreview = require('../labels-preview.js');
const { readManifest, labelsAfter, preview, report } = writePreview;

// The manifest of the repository has no rename left to do. The tests preview this one,
// where a `from_name` is the name the label had before the migration.
const manifestText = `
- name: "type: bug"
  from_name: "Type:Bug"
- name: "type: feature"
  from_name: "Type:Feature"
- name: "type: docs"
  from_name: "missing-docs"
- name: "area: build"
  from_name: "Project:Isobuild"
- name: "area: mobile"
  from_name: "Project:Mobile"
- name: "area: webapp"
  from_name: "Project:Webapp"
- name: "status: needs-triage"
  from_name: "triage"
- name: "status: needs-info"
  from_name: "not-ready"
- name: "status: confirmed"
  from_name: "confirmed"
- name: "status: ready"
  from_name: "ready"
- name: "status: stale"
  from_name: "idle"
- name: "legacy: needs-review"
- name: "priority: critical"
  from_name: "Severity:production"
- name: "priority: next"
  from_name: "Next 3.x.x"
- name: "priority: candidate"
  from_name: "Candidate 3.x.x"
- name: "priority: low"
- name: "experimental"
- name: "good first issue"
- name: "help wanted"
`;
const manifest = readManifest(manifestText);

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

test('renames and deletes, and keeps the labels already in the manifest', () => {
  assert.deepStrictEqual(labelsAfter(item(1, ['Type:Bug', 'Project:Isobuild', 'Project:NPM', 'help wanted']), manifest), [
    'area: build',
    'help wanted',
    'type: bug',
  ]);
  // A rename into a label the item already carries adds nothing.
  assert.deepStrictEqual(labelsAfter(item(2, ['Type:Bug', 'type: bug']), manifest), ['type: bug']);
});

test('adds the triage and legacy labels to open issues only', () => {
  const old = '2023-05-02T10:00:00Z';
  assert.deepStrictEqual(labelsAfter(item(1, [], { state: 'open', created_at: old }), manifest), [
    'legacy: needs-review',
    'status: needs-triage',
  ]);
  assert.deepStrictEqual(labelsAfter(item(2, [], { created_at: old }), manifest), []);
  assert.deepStrictEqual(labelsAfter(item(3, [], { state: 'open', created_at: old, pull_request: {} }), manifest), []);
  assert.deepStrictEqual(labelsAfter(item(6, [], { state: 'open', created_at: old, discussion: true }), manifest), []);
  // A status, old name or new, counts as triaged; `idle` alone does not.
  assert.deepStrictEqual(labelsAfter(item(4, ['confirmed'], { state: 'open' }), manifest), ['status: confirmed']);
  assert.deepStrictEqual(labelsAfter(item(5, ['idle'], { state: 'open' }), manifest), [
    'status: needs-triage',
    'status: stale',
  ]);
  // A feature request, old name or new, is not tied to a release.
  assert.deepStrictEqual(labelsAfter(item(7, ['Type:Feature', 'confirmed'], { state: 'open', created_at: old }), manifest), [
    'status: confirmed',
    'type: feature',
  ]);
  // A rename can take a status or a `legacy:` label away: the issue is read without it.
  const away = readManifest(
    `${manifestText}- name: "blocked"\n  from_name: "status: blocked"\n- name: "area: cordova"\n  from_name: "legacy: cordova"\n`
  );
  assert.deepStrictEqual(labelsAfter(item(8, ['status: blocked', 'legacy: cordova'], { state: 'open', created_at: old }), away), [
    'area: cordova',
    'blocked',
    'legacy: needs-review',
    'status: needs-triage',
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
      item(6, ['Severity:production', 'priority: low'], { title: 'Experiment' }),
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
      item(1, ['Project:Webapp'], { state: 'open' }),
      // An open discussion, and a closed one.
      item(13823, ['Project:Webapp'], { state: 'open', discussion: true }),
      item(11633, ['confirmed', 'not-ready', 'Project:Mobile'], { discussion: true }),
      item(11696, ['Project:NPM'], { state: 'open', discussion: true, title: 'Prototype of an npm cache' }),
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
  assert.deepStrictEqual(result.moves.get('Project:Webapp → area: webapp'), { all: 2, open: 2 });
  assert.deepStrictEqual(result.moves.get('Project:NPM → (deleted)'), { all: 1, open: 1 });
  // A discussion links to the discussions.
  assert.match(
    report(result, 'https://github.com/meteor/meteor'),
    /may fit\.\n\n- \[#11696\]\(https:\/\/github.com\/meteor\/meteor\/discussions\/11696\) Prototype of an npm cache\n/
  );
});

test('lists the open items of each priority, and a deleted label gives none', () => {
  const result = preview(
    [
      item(1, ['Severity:production', 'Impact:few'], { state: 'open' }),
      item(2, ['Impact:few', 'Next 3.x.x'], { state: 'open' }),
      item(3, ['Impact:few', 'Impact:some'], { state: 'open' }),
      item(4, ['Severity:production']),
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
        // Renamed to `priority: critical`: not deleted.
        item(4, ['Severity:production'], { state: 'open' }),
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
    repoLabels: ['tip', 'spam', 'Type:Bug', 'confirmed', 'help wanted'],
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
    { id: 'D_4', number: 4, title: 'Item 4', closed: false, createdAt: '2023-05-02T10:00:00Z', labels: { nodes: [{ name: 'Type:Bug' }] } },
    { id: 'D_5', number: 5, title: 'Item 5', closed: true, createdAt: '2025-03-10T10:00:00Z', labels: { nodes: [] } },
  ];
  const github = {
    rest: { issues: { listForRepo: 'items', listEvents: 'events', listLabelsForRepo: 'labels' } },
    paginate: async (method, params) => {
      if (method === 'items') return params.state === 'all' ? items : [];
      // Issues 1 and 6 already had the legacy label once, issue 7 never had it. A discussion
      // has no issue history.
      if (method === 'events') {
        if (params.issue_number === 7) return [{ event: 'labeled', label: { name: 'confirmed' } }];
        if (![1, 6].includes(params.issue_number)) throw Object.assign(new Error('Not Found'), { status: 404 });
        return [{ event: 'labeled', label: { name: 'legacy: needs-review' } }];
      }
      return [{ name: 'Type:Bug' }, { name: 'confirmed' }, { name: 'help wanted' }, { name: 'tip' }];
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
  const context = { repo: { owner: 'meteor', repo: 'meteor' } };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'labels-preview-'));
  const cwd = process.cwd();
  process.chdir(directory);
  try {
    await writePreview({ github, context, core, manifest: manifestText });
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
      { number: 4, pull_request: false, discussion: true, state: 'open', created_at: '2023-05-02T10:00:00Z', title: 'Item 4', labels: ['Type:Bug'] },
      { number: 5, pull_request: false, discussion: true, state: 'closed', created_at: '2025-03-10T10:00:00Z', title: 'Item 5', labels: [] },
    ]);
    assert.deepStrictEqual(fs.readFileSync('labels-preview.csv', 'utf8').split('\n'), [
      'number,kind,state,before,after',
      '"1","issue","open","Type:Bug; confirmed","status: confirmed; type: bug"',
      '"2","pr","open","Type:Bug","type: bug"',
      '"4","discussion","open","Type:Bug","type: bug"',
    ]);
    assert.match(summary, /^## Label changes preview\n\n3 items change\./);
    assert.match(summary, /\| tip → \(deleted\) \| 0 \| 0 \|/);

    // Without `manifest`, as the workflow calls it, the preview reads .github/labels.yml:
    // `help wanted` is in it, `Type:Bug` and `confirmed` are not.
    await writePreview({ github, context, core });
    assert.deepStrictEqual(fs.readFileSync('labels-preview.csv', 'utf8').split('\n'), [
      'number,kind,state,before,after',
      '"1","issue","open","Type:Bug; confirmed","status: needs-triage"',
      '"2","pr","open","Type:Bug",""',
      '"4","discussion","open","Type:Bug",""',
    ]);

    // A rename can make an issue one the legacy label is for: `legacy: cordova` becomes
    // `area: cordova`. Its history is read on the labels as renamed, as relabel.js does.
    const old = '2023-05-02T10:00:00Z';
    items.push(
      item(6, ['legacy: cordova', 'confirmed'], { state: 'open', created_at: old }),
      // Never had the legacy label: the preview announces it.
      item(7, ['confirmed'], { state: 'open', created_at: old }),
      // No history to read: a feature request once renamed, a closed issue, a recent one.
      item(8, ['Type:Feature', 'confirmed'], { state: 'open', created_at: old }),
      item(9, ['confirmed'], { created_at: old }),
      item(10, ['confirmed'], { state: 'open' }),
    );
    const renamedAway = `${manifestText}- name: "area: cordova"\n  from_name: "legacy: cordova"\n`;
    await writePreview({ github, context, core, manifest: renamedAway });
    const rows = fs.readFileSync('labels-preview.csv', 'utf8').split('\n');
    assert.ok(rows.includes('"6","issue","open","confirmed; legacy: cordova","area: cordova; status: confirmed"'));
    assert.ok(rows.includes('"7","issue","open","confirmed","legacy: needs-review; status: confirmed"'));
  } finally {
    process.chdir(cwd);
    fs.rmSync(directory, { recursive: true });
  }
});
