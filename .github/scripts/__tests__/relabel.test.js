// Tests for relabel.js using Node's built-in test runner (node:test)

const { test, mock } = require('node:test');
const assert = require('node:assert');
const relabel = require('../relabel.js');
const { MANIFEST, MERGES, ITEMS, NEEDS_TRIAGE, LEGACY_REVIEW, readManifest, isUntriaged } = relabel;
const fs = require('fs');

const manifestText = fs.readFileSync(MANIFEST, 'utf8');
const manifest = readManifest(manifestText);

const OLD = '2023-05-02T10:00:00Z';
const NEW = '2025-03-10T10:00:00Z';

const issue = (number, createdAt, labels = [], extra = {}) => ({
  number,
  state: extra.closed ? 'closed' : 'open',
  created_at: createdAt,
  labels: labels.map((name) => ({ name })),
  ...extra,
});

// A repository holding `items`; records every label added or removed. `limits` lists
// the rate limit after each write ({ remaining, reset }), to make a run wait or stop.
function buildGithubMock(items, limits = []) {
  const added = [];
  const removed = [];
  const listForRepo = Symbol('listForRepo');
  const listEvents = Symbol('listEvents');
  const answer = () => {
    const { remaining = 5000, reset = 0 } = limits.shift() ?? {};
    return { headers: { 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-reset': String(reset) } };
  };
  return {
    added,
    removed,
    rest: {
      issues: {
        listForRepo,
        listEvents,
        addLabels: async ({ issue_number, labels }) => {
          added.push(`#${issue_number} ${labels[0]}`);
          const item = items.find((candidate) => candidate.number === issue_number);
          if (!item.ignoresWrites) item.labels.push({ name: labels[0] });
          return answer();
        },
        removeLabel: async ({ issue_number, name }) => {
          removed.push(`#${issue_number} ${name}`);
          const item = items.find((candidate) => candidate.number === issue_number);
          item.labels = item.labels.filter((label) => label.name !== name);
          return answer();
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
    // Closed as `legacy: pre-3 only`, then reopened without it.
    issue(3, OLD, ['status: confirmed'], { events: [{ event: 'labeled', label: { name: 'legacy: pre-3 only' } }] }),
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
    issue(1, NEW, ['status: confirmed', 'bug', 'area: ddp', 'good first issue'], { closed: true }),
    issue(2, NEW, ['status: confirmed', 'bug', 'type: bug']),
    issue(3, NEW, ['status: confirmed', 'Project:CSS', 'Project:HMR']),
  ]);
  const left = await run(github);
  // Only additions, open items first.
  assert.deepStrictEqual(github.added, ['#3 area: build', '#1 type: bug']);
  assert.deepStrictEqual(github.removed, []);
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
    // The longest run takes about 400 turns; one that never settles must fail, not spin.
    for (let turns = 0; !outcome; turns++) {
      assert.ok(turns < 10_000, 'the run never settled');
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
  for (const method of ['addLabels', 'removeLabel']) {
    const write = github.rest.issues[method];
    github.rest.issues[method] = (params) => {
      times.push(Date.now());
      return write(params);
    };
  }
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

// Answers the first `failures` writes with a rate limit; returns the time of every attempt.
function limitWrites(github, failures, headers = {}, status = 403) {
  const times = [];
  for (const method of ['addLabels', 'removeLabel']) {
    const write = github.rest.issues[method];
    github.rest.issues[method] = async (params) => {
      times.push(Date.now());
      if (times.length <= failures) {
        throw Object.assign(new Error('You have exceeded a secondary rate limit'), { status, response: { headers } });
      }
      return write(params);
    };
  }
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
  const times = limitWrites(github, 1, {}, 429);
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(times, [T0, T0 + 60_000]);
});

test('waits for the hourly budget when a write finds it spent', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'bug'])]);
  const reset = (T0 + 30 * 60_000) / 1000;
  const times = limitWrites(github, 1, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) });
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(times, [T0, T0 + 30 * 60_000]);
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

// Answers the first `failures` reads of `method` with a rate limit; returns the time
// of every attempt.
function limitReads(github, method, failures, headers = {}) {
  const times = [];
  const paginate = github.paginate;
  github.paginate = async (called, params) => {
    if (called !== method) return paginate(called, params);
    times.push(Date.now());
    if (times.length <= failures) {
      throw Object.assign(new Error('You have exceeded a secondary rate limit'), { status: 403, response: { headers } });
    }
    return paginate(called, params);
  };
  return times;
}

test('waits out a rate limit on a read and reads again', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'bug'])]);
  const times = limitReads(github, github.rest.issues.listForRepo, 1, { 'retry-after': '120' });
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(times.slice(0, 2), [T0, T0 + 120_000]);
  assert.deepStrictEqual(github.added, ['#1 type: bug']);
});

test('waits out a rate limit on the read of an issue history', async () => {
  const github = buildGithubMock([issue(1, OLD, ['status: confirmed'])]);
  const times = limitReads(github, github.rest.issues.listEvents, 1, { 'retry-after': '120' });
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.strictEqual(times[1] - times[0], 120_000);
  assert.deepStrictEqual(github.added, ['#1 legacy: needs-review']);
});

test('fails when a read is rate limited for longer than the run', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'bug'])]);
  limitReads(github, github.rest.issues.listForRepo, 1, { 'retry-after': String(6 * 60 * 60) });
  await assert.rejects(runOnMockedClock(github), /longer than this run/);
  assert.deepStrictEqual(github.added, []);

  // An issue history that cannot be read must not read as "never had the label".
  const history = buildGithubMock([
    issue(1, OLD, ['status: confirmed'], { events: [{ event: 'unlabeled', label: { name: 'legacy: needs-review' } }] }),
  ]);
  limitReads(history, history.rest.issues.listEvents, 1, { 'retry-after': String(6 * 60 * 60) });
  await assert.rejects(runOnMockedClock(history), /longer than this run/);
  assert.deepStrictEqual(history.added, []);
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

test('gives the new label to the items of an old label the sync could not rename', { timeout: 10000 }, async () => {
  // `status: stale` already existed, so the sync left `idle` in place.
  const github = buildGithubMock([
    issue(1, NEW, ['status: confirmed', 'idle']),
    issue(2, NEW, ['status: confirmed', 'idle', 'status: stale']),
    issue(3, NEW, ['idle'], { closed: true }),
  ]);
  assert.strictEqual(await run(github), 0);
  assert.deepStrictEqual(github.added, ['#1 status: stale', '#3 status: stale']);
});

test('applies the decisions on single items, open ones only', async () => {
  const github = buildGithubMock([
    issue(14825, NEW, ['status: confirmed', 'type: bug', 'priority: candidate', 'Impact:most']),
    issue(14586, NEW, [], { pull_request: {} }),
    issue(14889, NEW, ['area: mobile'], { pull_request: {} }),
    issue(14886, NEW, [], { pull_request: {}, closed: true }),
  ]);
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(github.added, ['#14825 priority: critical', '#14825 type: security', '#14586 area: cli']);
  assert.deepStrictEqual(github.removed, ['#14825 type: bug', '#14825 priority: candidate']);
});

test('applies the decisions before the history of closed items', async () => {
  const github = buildGithubMock([
    issue(14586, NEW, ['Impact:most'], { pull_request: {} }),
    issue(1, NEW, ['bug'], { closed: true }),
  ]);
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(github.added, ['#14586 priority: critical', '#14586 area: cli', '#1 type: bug']);
});

// #14825 with only its two removals left to do.
const twoRemovals = () =>
  issue(14825, NEW, ['status: confirmed', 'type: bug', 'priority: candidate', 'Impact:most', 'priority: critical', 'type: security']);

test('a removal waits out a rate limit and is followed by the pause, like an addition', async () => {
  const github = buildGithubMock([twoRemovals()]);
  const times = limitWrites(github, 1, { 'retry-after': '120' });
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(times, [T0, T0 + 120_000, T0 + 121_000]);
  assert.deepStrictEqual(github.removed, ['#14825 type: bug', '#14825 priority: candidate']);
});

test('once stopped, sends no removal either', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'bug']), twoRemovals()]);
  const times = limitWrites(github, 1, { 'retry-after': String(6 * 60 * 60) });
  // The addition that could not wait, and the two removals.
  assert.strictEqual(await runOnMockedClock(github), 3);
  assert.strictEqual(times.length, 1);
  assert.deepStrictEqual([github.added, github.removed], [[], []]);
});

test('a label someone removed in the meantime is not an error', async () => {
  const gone = (status, message) => async () => {
    throw Object.assign(new Error(message), { status });
  };
  const github = buildGithubMock([twoRemovals()]);
  github.rest.issues.removeLabel = gone(404, 'Label does not exist');
  assert.strictEqual(await runOnMockedClock(github), 0);

  // The answer still tells the budget: the next write waits for the reset.
  const low = buildGithubMock([twoRemovals(), issue(1, NEW, ['bug'], { closed: true })]);
  const headers = { 'x-ratelimit-remaining': '150', 'x-ratelimit-reset': String((T0 + 600_000) / 1000) };
  low.rest.issues.removeLabel = async () => {
    throw Object.assign(new Error('Label does not exist'), { status: 404, response: { headers } });
  };
  const times = timeWrites(low);
  assert.strictEqual(await runOnMockedClock(low), 0);
  assert.deepStrictEqual(low.added, ['#1 type: bug']);
  assert.deepStrictEqual(times, [T0, T0 + 600_000, T0 + 601_000]);

  const refused = buildGithubMock([twoRemovals()]);
  refused.rest.issues.removeLabel = gone(403, 'Resource not accessible by integration');
  await assert.rejects(runOnMockedClock(refused), /not accessible/);
});

test('the dry run counts the decisions without writing', async () => {
  const github = buildGithubMock([
    issue(14825, NEW, ['status: confirmed', 'Type:Bug', 'Candidate 3.x.x', 'Impact:most']),
  ]);
  // The merge of `Impact:most`, `type: security`, and the two removals.
  assert.strictEqual(await run(github, true), 4);
  assert.deepStrictEqual([github.added, github.removed], [[], []]);
});

test('leaves the decided items alone once no open item carries a merged label', async () => {
  const github = buildGithubMock([
    issue(14586, NEW, [], { pull_request: {} }),
    issue(14825, NEW, ['status: confirmed', 'type: bug', 'priority: candidate']),
    issue(3, NEW, ['bug', 'type: bug'], { closed: true }),
    // Neither a label from outside the manifest nor an old name the sync could not
    // rename says that the migration is still going on.
    issue(4, NEW, ['github_actions', 'dependencies'], { pull_request: {} }),
    issue(5, NEW, ['status: confirmed', 'idle', 'status: stale']),
  ]);
  assert.strictEqual(await run(github), 0);
  assert.deepStrictEqual([github.added, github.removed], [[], []]);
});

test('a move does not give back a label that a decision removes', async () => {
  // `type: bug` already existed, so the sync left `Type:Bug` in place.
  const github = buildGithubMock([
    issue(14825, NEW, ['status: confirmed', 'Type:Bug']),
    issue(2, NEW, ['status: confirmed', 'Type:Bug', 'bug']),
  ]);
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(github.added, ['#2 type: bug', '#14825 type: security']);
  assert.deepStrictEqual(github.removed, []);

  // Later the merged labels are gone and `Type:Bug` is still there: it does not keep
  // the decisions alive, so what people changed since stays.
  const later = buildGithubMock([
    issue(14825, NEW, ['status: confirmed', 'Type:Bug', 'type: bug', 'priority: candidate']),
    issue(2, NEW, ['status: confirmed', 'Type:Bug', 'type: bug']),
  ]);
  assert.strictEqual(await run(later), 0);
  assert.deepStrictEqual([later.added, later.removed], [[], []]);

  // Closed, the item has no decision: the move applies.
  const closed = buildGithubMock([issue(14825, NEW, ['Type:Bug'], { closed: true })]);
  assert.strictEqual(await runOnMockedClock(closed), 0);
  assert.deepStrictEqual(closed.added, ['#14825 type: bug']);
});

test('the dry run reads the labels as renamed, so a rename already gives the new label', async () => {
  // `Type:Bug` is renamed to `type: bug`: merging `bug` into it adds nothing.
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'Type:Bug', 'bug'])]);
  assert.strictEqual(await run(github, true), 0);
});

test('every old or new status counts as triage, except stale', () => {
  const statuses = [...manifest.renames, ...Object.entries(MERGES)]
    .filter(([, to]) => to.startsWith('status: ') && to !== 'status: stale')
    .map(([from]) => from);
  const newStatuses = [...manifest.names].filter((name) => name.startsWith('status: ') && name !== 'status: stale');
  for (const name of [...statuses, ...newStatuses]) {
    assert.strictEqual(isUntriaged(issue(1, NEW, [name])), false, name);
  }
  assert.strictEqual(isUntriaged(issue(1, NEW, ['status: stale'])), true);
});

test('every label the script adds is in the manifest, and every merged label is out of it', () => {
  for (const [oldLabel, newLabel] of Object.entries(MERGES)) {
    assert.ok(manifest.names.has(newLabel), newLabel);
    assert.ok(!manifest.names.has(oldLabel) && !manifest.renames.has(oldLabel), oldLabel);
  }
  assert.ok(manifest.names.has(NEEDS_TRIAGE));
  assert.ok(manifest.names.has(LEGACY_REVIEW));
  for (const { add = [], remove = [] } of Object.values(ITEMS)) {
    for (const name of [...add, ...remove]) {
      assert.ok(manifest.names.has(name), name);
    }
  }
});

test('the manifest keeps the one quoted key per line that the scripts read', () => {
  for (const line of manifestText.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    assert.match(line, /^(- name|  (color|description|from_name)): "[^"]*"$/);
  }
});
