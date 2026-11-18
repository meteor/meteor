// Tests for relabel.js using Node's built-in test runner (node:test)

const { test, mock } = require('node:test');
const assert = require('node:assert');
const relabel = require('../relabel.js');
const { MERGES, readManifest, isUntriaged } = relabel;
const fs = require('fs');
const path = require('path');

const OLD = '2023-05-02T10:00:00Z';
const NEW = '2025-03-10T10:00:00Z';

const issue = (number, createdAt, labels = [], extra = {}) => ({
  number,
  created_at: createdAt,
  labels: labels.map((name) => ({ name })),
  ...extra,
});

// A repository holding `items`; records every label added. `limits` lists the rate
// limit after each write ({ remaining, reset }), to make a run wait or stop.
function buildGithubMock(items, limits = []) {
  const added = [];
  const listForRepo = Symbol('listForRepo');
  const listEvents = Symbol('listEvents');
  return {
    added,
    rest: {
      issues: {
        listForRepo,
        listEvents,
        addLabels: async ({ issue_number, labels }) => {
          added.push(`#${issue_number} ${labels[0]}`);
          const item = items.find((candidate) => candidate.number === issue_number);
          if (!item.ignoresWrites) item.labels.push({ name: labels[0] });
          const { remaining = 5000, reset = 0 } = limits.shift() ?? {};
          return { headers: { 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-reset': String(reset) } };
        },
      },
    },
    paginate: async (method, params) => {
      if (method === listEvents) {
        return items.find((item) => item.number === params.issue_number).events ?? [];
      }
      return items.filter(
        (item) =>
          (params.state === 'all' || (params.state === 'closed') === Boolean(item.closed)) &&
          (!params.labels || item.labels.some((label) => label.name === params.labels))
      );
    },
  };
}

const run = (github, dryRun = false, runTime) => {
  const log = console.log;
  console.log = () => {};
  return relabel({ github, context: { repo: { owner: 'meteor', repo: 'meteor' } }, dryRun, runTime }).finally(() => {
    console.log = log;
  });
};

// Only the legacy label, so the other steps do not clutter the assertions.
const legacyOnly = (added) => added.filter((entry) => entry.endsWith('legacy: needs-review'));

test('marks open issues from before 3.0, feature requests aside', { timeout: 10000 }, async () => {
  const github = buildGithubMock([
    issue(1, OLD, ['status: confirmed']),
    issue(2, NEW, ['status: confirmed']),
    issue(3, OLD, ['status: confirmed', 'type: feature']),
    issue(4, OLD, ['status: confirmed', 'Type:Feature']),
    issue(5, OLD, ['status: confirmed', 'enhancement']),
    issue(6, OLD, ['status: confirmed', 'legacy: pre-3 only']),
    issue(7, OLD, ['status: confirmed'], { pull_request: {} }),
    issue(8, OLD, ['status: confirmed'], { closed: true }),
    issue(9, OLD, ['status: confirmed', 'legacy-build-stack']),
  ]);
  const left = await run(github, true);
  assert.deepStrictEqual(legacyOnly(github.added), []);
  // #1 and #9 legacy, plus the merges: #5 type: feature, #9 area: build.
  assert.strictEqual(left, 4);

  await run(github);
  assert.deepStrictEqual(legacyOnly(github.added), ['#1 legacy: needs-review', '#9 legacy: needs-review']);
});

test('never adds it back once a triager removed it', async () => {
  const github = buildGithubMock([
    issue(1, OLD, ['status: confirmed'], {
      events: [
        { event: 'labeled', label: { name: 'legacy: needs-review' } },
        { event: 'unlabeled', label: { name: 'legacy: needs-review' } },
      ],
    }),
    issue(2, OLD, ['status: confirmed'], { events: [{ event: 'labeled', label: { name: 'type: bug' } }] }),
  ]);
  await run(github);
  assert.deepStrictEqual(github.added, ['#2 legacy: needs-review']);
});

test('an untriaged old issue gets both labels', async () => {
  const github = buildGithubMock([issue(1, OLD)]);
  await run(github);
  assert.deepStrictEqual(github.added, ['#1 status: needs-triage', '#1 legacy: needs-review']);
});

test('merges into the new label, keeps every other label, closed items included', { timeout: 10000 }, async () => {
  const github = buildGithubMock([
    issue(1, NEW, ['status: confirmed', 'bug', 'Project:DDP', 'good first issue'], { closed: true }),
    issue(2, NEW, ['status: confirmed', 'bug', 'type: bug']),
    issue(3, NEW, ['status: confirmed', 'Project:CSS', 'Project:HMR']),
  ]);
  const left = await run(github);
  // Only additions: the mock has no call to remove a label. Open items come first.
  assert.deepStrictEqual(github.added, ['#3 area: build', '#1 type: bug']);
  assert.strictEqual(left, 0);
});

const HOUR = 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

// Runs relabel on a mocked clock: every sleep fires at once and moves Date.now() forward.
async function runOnMockedClock(github, runTime) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: T0 });
  try {
    let outcome;
    run(github, false, runTime).then(
      (left) => {
        outcome = { left };
      },
      (error) => {
        outcome = { error };
      }
    );
    while (!outcome) {
      await new Promise((resolve) => setImmediate(resolve));
      mock.timers.runAll();
    }
    if (outcome.error) throw outcome.error;
    return outcome.left;
  } finally {
    mock.timers.reset();
  }
}

// Records the time of every write.
function timeWrites(github) {
  const times = [];
  const addLabels = github.rest.issues.addLabels;
  github.rest.issues.addLabels = (params) => {
    times.push(Date.now());
    return addLabels(params);
  };
  return times;
}

test('spaces the writes, waits for the rate limit, and keeps 400 writes per rolling hour', async () => {
  const items = Array.from({ length: 402 }, (_, index) => issue(index + 1, NEW, ['status: confirmed', 'bug']));
  // The first write leaves the budget low until 10 minutes later.
  const github = buildGithubMock(items, [{ remaining: 150, reset: (T0 + 600_000) / 1000 }]);
  const times = timeWrites(github);
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.strictEqual(times.length, 402);
  assert.strictEqual(times[0], T0);
  assert.strictEqual(times[1], T0 + 600_000);
  assert.strictEqual(times[2] - times[1], 1000);
  assert.strictEqual(times[400], times[0] + HOUR);
  assert.strictEqual(times[401], times[1] + HOUR);
});

test('waits for a reset just under 5 hours, stops for one just over', async () => {
  const items = () => [issue(1, NEW, ['status: confirmed', 'bug']), issue(2, NEW, ['status: confirmed', 'enhancement'])];
  const under = buildGithubMock(items(), [{ remaining: 150, reset: (T0 + 5 * HOUR - 60_000) / 1000 }]);
  assert.strictEqual(await runOnMockedClock(under), 0);
  const over = buildGithubMock(items(), [{ remaining: 150, reset: (T0 + 5 * HOUR + 60_000) / 1000 }]);
  assert.strictEqual(await runOnMockedClock(over), 1);
});

test('a budget of exactly the reserve does not wait', { timeout: 10000 }, async () => {
  const items = [issue(1, NEW, ['status: confirmed', 'bug']), issue(2, NEW, ['status: confirmed', 'enhancement'])];
  const github = buildGithubMock(items, [{ remaining: 200, reset: Math.ceil(Date.now() / 1000) + 3600 }]);
  assert.strictEqual(await run(github, false, 60 * 1000), 0);
});

// Answers the first `failures` writes with a secondary rate limit; returns the time of every attempt.
function limitWrites(github, failures, headers = {}) {
  const times = [];
  const addLabels = github.rest.issues.addLabels;
  github.rest.issues.addLabels = async (params) => {
    times.push(Date.now());
    if (times.length <= failures) {
      throw Object.assign(new Error('You have exceeded a secondary rate limit'), { status: 403, response: { headers } });
    }
    return addLabels(params);
  };
  return times;
}

test('waits out a secondary rate limit and writes again', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'bug'])]);
  const times = limitWrites(github, 1, { 'retry-after': '120' });
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(times, [T0, T0 + 120_000]);
  assert.deepStrictEqual(github.added, ['#1 type: bug']);
});

test('waits a minute when the rate limit comes without a delay', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'bug'])]);
  const times = limitWrites(github, 1);
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(times, [T0, T0 + 60_000]);
});

test('fails after three rate limited answers in a row', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'bug'])]);
  const times = limitWrites(github, 3, { 'retry-after': '120' });
  await assert.rejects(runOnMockedClock(github), /secondary rate limit/);
  assert.strictEqual(times.length, 3);
});

test('stops when the rate limit asks for a wait longer than the run', async () => {
  const github = buildGithubMock([
    issue(1, NEW, ['status: confirmed', 'bug']),
    issue(2, NEW, ['status: confirmed', 'enhancement']),
  ]);
  const times = limitWrites(github, 1, { 'retry-after': String(6 * 60 * 60) });
  assert.strictEqual(await runOnMockedClock(github), 1);
  assert.strictEqual(times.length, 1);
  assert.deepStrictEqual(github.added, []);
});

test('fails on an error other than a rate limit', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'bug'])]);
  github.rest.issues.addLabels = async () => {
    throw Object.assign(new Error('Resource not accessible by integration'), { status: 403 });
  };
  await assert.rejects(run(github), /not accessible/);
});

test('once stopped, reads no more issue history', async () => {
  const items = [
    issue(1, NEW, ['status: confirmed', 'bug']),
    issue(2, NEW, ['status: confirmed', 'enhancement']),
    issue(3, OLD, ['status: confirmed']),
  ];
  const github = buildGithubMock(items, [{ remaining: 150, reset: (T0 + 6 * HOUR) / 1000 }]);
  const paginate = github.paginate;
  let historyReads = 0;
  github.paginate = (method, params) => {
    if (method === github.rest.issues.listEvents) historyReads++;
    return paginate(method, params);
  };
  assert.ok((await runOnMockedClock(github)) > 0);
  assert.strictEqual(historyReads, 0);
});

test('stops when the wait would outlast the run, and the next run finishes', { timeout: 10000 }, async () => {
  const items = [
    issue(1, NEW, ['status: confirmed', 'bug']),
    issue(2, NEW, ['status: confirmed', 'enhancement']),
    issue(3, NEW, ['status: confirmed', 'Project:CSS']),
  ];
  const resetInOneHour = Math.ceil(Date.now() / 1000) + 3600;
  const first = buildGithubMock(items, [{ remaining: 150, reset: resetInOneHour }]);
  // A stopped run counts the item it could not label, and leaves the rest unread.
  assert.strictEqual(await run(first, false, 60 * 1000), 1);
  assert.deepStrictEqual(first.added, ['#1 type: bug']);

  const second = buildGithubMock(items);
  assert.strictEqual(await run(second), 0);
  assert.deepStrictEqual(second.added, ['#2 type: feature', '#3 area: build']);
});

test('keeps the old labels while an item still misses its new label', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'bug'], { ignoresWrites: true })]);
  assert.strictEqual(await run(github), 1);
});

test('keeps the old labels while a closed item still misses its new label', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'bug'], { ignoresWrites: true, closed: true })]);
  assert.strictEqual(await run(github), 1);
});

test('counts an item once when several old labels merge into the same new one', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'Project:CSS', 'Project:HMR', 'Project:Modules'])]);
  assert.strictEqual(await run(github, true), 1);
});

test('the dry run reads the labels as renamed, so a rename already gives the new label', async () => {
  // `Type:Bug` is renamed to `type: bug`: merging `bug` into it adds nothing.
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'Type:Bug', 'bug'])]);
  assert.strictEqual(await run(github, true), 0);
});

test('every old or new status counts as triage, except stale', () => {
  const manifest = readManifest(fs.readFileSync(path.join(__dirname, '../../labels.yml'), 'utf8'));
  const statuses = [...manifest.renames, ...Object.entries(MERGES)]
    .filter(([, to]) => to.startsWith('status: ') && to !== 'status: stale')
    .map(([from]) => from);
  for (const name of [...statuses, 'status: confirmed']) {
    assert.strictEqual(isUntriaged(issue(1, NEW, [name])), false, name);
  }
  assert.strictEqual(isUntriaged(issue(1, NEW, ['status: stale'])), true);
});
