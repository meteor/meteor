// Tests for labels-preview.js using Node's built-in test runner (node:test)

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const writePreview = require('../labels-preview.js');
const { readManifest, migrate, preview, report } = writePreview;
const { MANIFEST } = require('../relabel.js');

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
  // A status, old name or new, counts as triaged; `idle` alone does not.
  assert.deepStrictEqual(migrate(item(4, ['confirmed'], { state: 'open' }), manifest), ['status: confirmed']);
  assert.deepStrictEqual(migrate(item(5, ['idle'], { state: 'open' }), manifest), [
    'status: needs-triage',
    'status: stale',
  ]);
});

test('lists the moves and the cases to decide', () => {
  const result = preview(
    [
      item(1, ['Candidate 3.x.x']),
      item(2, ['Severity:production', 'Impact:few', 'confirmed'], { state: 'open' }),
      item(3, ['Severity:has-workaround', 'confirmed'], { state: 'open', title: 'Experiment with a new driver' }),
      item(4, ['ready'], { state: 'open', pull_request: {} }),
      item(5, ['help wanted']),
      item(6, ['Impact:most', 'priority: low'], { title: 'Experiment' }),
      item(7, ['ready'], { pull_request: {}, title: 'PoC' }),
      item(8, ['confirmed'], { state: 'open', title: 'PoC of a cache' }),
      item(9, ['confirmed'], { state: 'open', title: 'Epoch dates drift' }),
    ],
    manifest
  );
  assert.deepStrictEqual(result.rows.map((row) => row.number), [1, 2, 3, 4, 6, 7, 8, 9]);
  assert.deepStrictEqual(result.moves.get('Impact:few → priority: low'), { all: 1, open: 1 });
  assert.deepStrictEqual(result.moves.get('Severity:has-workaround → (deleted)'), { all: 1, open: 1 });
  assert.deepStrictEqual(result.decide.candidates.map(({ number }) => number), [1]);
  assert.deepStrictEqual(result.decide.experiments.map(({ number }) => number), [3, 8]);
  assert.deepStrictEqual(result.decide.conflicts, [
    { item: result.decide.conflicts[0].item, values: ['priority: critical', 'priority: low'] },
  ]);
  assert.deepStrictEqual(result.decide.prStatuses.map(({ number }) => number), [4]);
  assert.match(report(result, 'https://github.com/meteor/meteor'), /- `Severity:has-workaround`: 1 open of 1/);
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
        item(4, ['Impact:few'], { state: 'open' }),
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
  const github = {
    rest: { issues: { listForRepo: 'items', listEvents: 'events', listLabelsForRepo: 'labels' } },
    paginate: async (method, params) => {
      if (method === 'items') return params.state === 'all' ? items : [];
      // Issue 1 already had the legacy label once.
      if (method === 'events') return [{ event: 'labeled', label: { name: 'legacy: needs-review' } }];
      return [{ name: 'Type:Bug' }, { name: 'confirmed' }, { name: 'help wanted' }, { name: 'tip' }];
    },
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
      state: 'open',
      created_at: '2023-05-02T10:00:00Z',
      title: 'Item 1',
      labels: ['Type:Bug', 'confirmed'],
    });
    assert.deepStrictEqual(fs.readFileSync('labels-preview.csv', 'utf8').split('\n'), [
      'number,kind,state,before,after',
      '"1","issue","open","Type:Bug; confirmed","status: confirmed; type: bug"',
      '"2","pr","open","Type:Bug","type: bug"',
    ]);
    assert.match(summary, /^## Label migration preview\n\n2 items change\./);
    assert.match(summary, /\| tip → \(deleted\) \| 0 \| 0 \|/);
  } finally {
    process.chdir(cwd);
    fs.rmSync(directory, { recursive: true });
  }
});
