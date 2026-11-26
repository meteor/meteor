// Tests for relabel.js using Node's built-in test runner (node:test)

const { test, mock } = require('node:test');
const assert = require('node:assert');
const relabel = require('../relabel.js');
const { MANIFEST, NEEDS_TRIAGE, LEGACY_REVIEW, readManifest, isUntriaged } = relabel;
const fs = require('fs');

const manifestText = fs.readFileSync(MANIFEST, 'utf8');
const manifest = readManifest(manifestText);

// The manifest of the repository has no rename left to do. The runs read this one,
// where each `from_name` is the name the label had before the migration.
const testManifestText = `
- name: "type: bug"
  from_name: "Type:Bug"
- name: "type: feature"
  from_name: "Type:Feature"
- name: "area: accounts"
  from_name: "Project:Accounts:Password"
- name: "area: build"
  from_name: "Project:Isobuild"
- name: "area: mobile"
  from_name: "Project:Mobile"
- name: "area: webapp"
  from_name: "Project:Webapp"
- name: "status: needs-triage"
  from_name: "triage"
- name: "status: confirmed"
  from_name: "confirmed"
- name: "status: stale"
  from_name: "idle"
`;
const testManifest = readManifest(testManifestText);

const OLD = '2023-05-02T10:00:00Z';
const NEW = '2025-03-10T10:00:00Z';

const issue = (number, createdAt, labels = [], extra = {}) => ({
  number,
  state: extra.closed ? 'closed' : 'open',
  created_at: createdAt,
  labels: labels.map((name) => ({ name })),
  ...extra,
});

const discussion = (number, labels = [], extra = {}) => issue(number, NEW, labels, { discussion: true, ...extra });

// A repository holding `items`; records every label added or removed (the script must
// never remove one). `limits` lists the rate limit after each write ({ remaining, reset }),
// to make a run wait or stop. Its labels are the ones of the test manifest and the ones
// the items carry. Its discussions answer to GraphQL only, two per page.
function buildGithubMock(items, limits = []) {
  const added = [];
  const removed = [];
  const issues = () => items.filter((item) => !item.discussion);
  const discussions = () => items.filter((item) => item.discussion);
  const repoLabels = () => {
    const carried = items.flatMap((item) => item.labels.map((label) => label.name));
    return [...new Set([...testManifest.names, ...carried])].map((name) => ({ name, node_id: `L_${name}` }));
  };
  const listForRepo = Symbol('listForRepo');
  const listEvents = Symbol('listEvents');
  const listLabelsForRepo = Symbol('listLabelsForRepo');
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
        listLabelsForRepo,
        addLabels: async ({ issue_number, labels }) => {
          added.push(`#${issue_number} ${labels[0]}`);
          const item = issues().find((candidate) => candidate.number === issue_number);
          if (!item.ignoresWrites) item.labels.push({ name: labels[0] });
          return answer();
        },
        removeLabel: async ({ issue_number, name }) => {
          removed.push(`#${issue_number} ${name}`);
          const item = issues().find((candidate) => candidate.number === issue_number);
          item.labels = item.labels.filter((label) => label.name !== name);
          return answer();
        },
      },
    },
    paginate: async (method, params) => {
      if (method === listEvents) {
        return items.find((item) => item.number === params.issue_number).events ?? [];
      }
      if (method === listLabelsForRepo) return repoLabels();
      return issues().filter(
        (item) =>
          (params.state === 'all' || (params.state === 'closed') === Boolean(item.closed)) &&
          (!params.labels || item.labels.some((label) => label.name === params.labels))
      );
    },
    graphql: async (query, variables) => {
      if (query.includes('addLabelsToLabelable')) {
        const item = discussions().find((candidate) => `D_${candidate.number}` === variables.item);
        const label = repoLabels().find((candidate) => candidate.node_id === variables.label);
        if (!item || !label) throw new Error('Could not resolve to a node with that global id');
        added.push(`#${item.number} ${label.name}`);
        if (!item.ignoresWrites) item.labels.push({ name: label.name });
        return { addLabelsToLabelable: { clientMutationId: null } };
      }
      const start = Number(variables.after ?? 0);
      return {
        repository: {
          discussions: {
            pageInfo: { hasNextPage: start + 2 < discussions().length, endCursor: String(start + 2) },
            nodes: discussions()
              .slice(start, start + 2)
              .map((item) => ({
                id: `D_${item.number}`,
                number: item.number,
                title: `Discussion ${item.number}`,
                closed: Boolean(item.closed),
                createdAt: item.created_at,
                labels: { nodes: item.labels.map(({ name }) => ({ name })) },
              })),
          },
        },
      };
    },
  };
}

const run = (github, dryRun = false, runTime) => {
  const log = console.log;
  console.log = () => {};
  const context = { repo: { owner: 'meteor', repo: 'meteor' } };
  return relabel({ github, context, dryRun, runTime, manifest: testManifestText }).finally(() => {
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
    // `Type:Feature` is renamed to `type: feature`.
    issue(4, OLD, ['status: confirmed', 'Type:Feature']),
    issue(6, OLD, ['status: confirmed', 'legacy: pre-3 only']),
    issue(7, OLD, ['status: confirmed'], { pull_request: {} }),
    issue(8, OLD, ['status: confirmed'], { closed: true }),
    // A label starting with `legacy-` is not a `legacy:` label.
    issue(9, OLD, ['status: confirmed', 'legacy-build-stack']),
  ]);
  const left = await run(github, true);
  assert.deepStrictEqual(legacyOnly(github.added), []);
  // #1 and #9.
  assert.strictEqual(left, 2);

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

test('moves to the new label, keeps every other label, closed items included', { timeout: 10000 }, async () => {
  const github = buildGithubMock([
    issue(1, NEW, ['status: confirmed', 'Type:Bug', 'area: ddp', 'good first issue'], { closed: true }),
    issue(2, NEW, ['status: confirmed', 'Type:Bug', 'type: bug']),
    issue(3, NEW, ['status: confirmed', 'Project:Isobuild']),
    // Already moved by a run that stopped: not written again.
    issue(4, NEW, ['Type:Bug', 'type: bug'], { closed: true }),
  ]);
  const left = await run(github);
  // Only additions, open items first.
  assert.deepStrictEqual(github.added, ['#3 area: build', '#1 type: bug']);
  assert.deepStrictEqual(github.removed, []);
  assert.strictEqual(left, 0);
});

test('gives the discussions their new labels too, open ones first', async () => {
  const github = buildGithubMock([
    issue(1, NEW, ['status: confirmed', 'Type:Bug'], { closed: true }),
    // Its only label is an old one.
    discussion(13823, ['Project:Webapp']),
    discussion(11633, ['status: confirmed', 'Project:Mobile'], { closed: true }),
    // Already moved, by hand or by a run that stopped.
    discussion(13353, ['Project:Webapp', 'area: webapp']),
    // Without a status and opened before 3.0: the triage and legacy labels are for issues.
    discussion(11516, ['Project:Accounts:Password'], { created_at: OLD }),
    discussion(2, ['good first issue']),
  ]);
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(github.added, ['#11516 area: accounts', '#13823 area: webapp', '#1 type: bug', '#11633 area: mobile']);
  assert.deepStrictEqual(github.removed, []);
});

test('the dry run counts without writing, and leaves the discussions to the sync', async () => {
  const github = buildGithubMock([
    issue(1, NEW),
    // `Project:Webapp` is renamed to `area: webapp`: nothing to add.
    discussion(13823, ['Project:Webapp']),
    discussion(3, ['Project:Webapp', 'area: webapp']),
  ]);
  // The triage of #1.
  assert.strictEqual(await run(github, true), 1);
  assert.deepStrictEqual(github.added, []);
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

const isWrite = (query) => query.includes('mutation');

// Records the time of every write.
function timeWrites(github) {
  const times = [];
  const write = github.rest.issues.addLabels;
  github.rest.issues.addLabels = (params) => {
    times.push(Date.now());
    return write(params);
  };
  const graphql = github.graphql;
  github.graphql = (query, variables) => {
    if (isWrite(query)) times.push(Date.now());
    return graphql(query, variables);
  };
  return times;
}

test('spaces the writes, waits for the rate limit, and keeps 400 writes per rolling hour', async () => {
  const items = Array.from({ length: 402 }, (_, index) => issue(index + 1, NEW, ['status: confirmed', 'Type:Bug']));
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
  const items = () => [issue(1, NEW, ['status: confirmed', 'Type:Bug']), issue(2, NEW, ['status: confirmed', 'Type:Feature'])];
  const under = buildGithubMock(items(), [{ remaining: 150, reset: (T0 + 5 * HOUR - 60_000) / 1000 }]);
  assert.strictEqual(await runOnMockedClock(under), 0);
  const over = buildGithubMock(items(), [{ remaining: 150, reset: (T0 + 5 * HOUR + 60_000) / 1000 }]);
  assert.strictEqual(await runOnMockedClock(over), 1);
});

test('a budget of exactly the reserve does not wait', { timeout: 10000 }, async () => {
  const items = [issue(1, NEW, ['status: confirmed', 'Type:Bug']), issue(2, NEW, ['status: confirmed', 'Type:Feature'])];
  const github = buildGithubMock(items, [{ remaining: 200, reset: Math.ceil(Date.now() / 1000) + 3600 }]);
  assert.strictEqual(await run(github, false, 60 * 1000), 0);
});

// Answers the first `failures` writes with a rate limit; returns the time of every attempt.
function limitWrites(github, failures, headers = {}, status = 403) {
  const times = [];
  const write = github.rest.issues.addLabels;
  github.rest.issues.addLabels = async (params) => {
    times.push(Date.now());
    if (times.length <= failures) {
      throw Object.assign(new Error('You have exceeded a secondary rate limit'), { status, response: { headers } });
    }
    return write(params);
  };
  const graphql = github.graphql;
  github.graphql = async (query, variables) => {
    if (!isWrite(query)) return graphql(query, variables);
    times.push(Date.now());
    if (times.length <= failures) {
      throw Object.assign(new Error('You have exceeded a secondary rate limit'), { status, response: { headers } });
    }
    return graphql(query, variables);
  };
  return times;
}

test('waits out a secondary rate limit and writes again', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'Type:Bug'])]);
  const times = limitWrites(github, 1, { 'retry-after': '120' });
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(times, [T0, T0 + 120_000]);
  assert.deepStrictEqual(github.added, ['#1 type: bug']);
});

test('a discussion is written under the same limits', async () => {
  // The first write leaves the budget low until 10 minutes later.
  const low = buildGithubMock(
    [
      issue(1, NEW, ['status: confirmed', 'Type:Bug']),
      discussion(13823, ['Project:Webapp']),
      issue(2, NEW, ['Project:Mobile'], { closed: true }),
    ],
    [{ remaining: 150, reset: (T0 + 600_000) / 1000 }]
  );
  const waited = timeWrites(low);
  assert.strictEqual(await runOnMockedClock(low), 0);
  assert.deepStrictEqual(low.added, ['#1 type: bug', '#13823 area: webapp', '#2 area: mobile']);
  assert.deepStrictEqual(waited, [T0, T0 + 600_000, T0 + 601_000]);

  const limited = buildGithubMock([
    discussion(13823, ['Project:Webapp']),
    discussion(13353, ['confirmed']),
  ]);
  const times = limitWrites(limited, 1, { 'retry-after': '120' });
  assert.strictEqual(await runOnMockedClock(limited), 0);
  // The write again, then the pause before the next one.
  assert.deepStrictEqual(times, [T0, T0 + 120_000, T0 + 121_000]);
  assert.deepStrictEqual(limited.added, ['#13823 area: webapp', '#13353 status: confirmed']);
});

test('waits a minute when the rate limit comes without a delay', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'Type:Bug'])]);
  const times = limitWrites(github, 1, {}, 429);
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(times, [T0, T0 + 60_000]);
});

test('waits for the hourly budget when a write finds it spent', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'Type:Bug'])]);
  const reset = (T0 + 30 * 60_000) / 1000;
  const times = limitWrites(github, 1, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) });
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(times, [T0, T0 + 30 * 60_000]);
});

test('fails after three rate limited answers in a row', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'Type:Bug'])]);
  const times = limitWrites(github, 3, { 'retry-after': '120' });
  await assert.rejects(runOnMockedClock(github), /secondary rate limit/);
  assert.strictEqual(times.length, 3);
});

test('stops when the rate limit asks for a wait longer than the run', async () => {
  const github = buildGithubMock([
    issue(1, NEW, ['status: confirmed', 'Type:Bug']),
    issue(2, NEW, ['status: confirmed', 'Type:Feature']),
  ]);
  const times = limitWrites(github, 1, { 'retry-after': String(6 * 60 * 60) });
  assert.strictEqual(await runOnMockedClock(github), 1);
  assert.strictEqual(times.length, 1);
  assert.deepStrictEqual(github.added, []);
});

test('once stopped, sends no other write', async () => {
  // Two items of the same old label: the second one is counted, not written.
  const github = buildGithubMock([
    issue(1, NEW, ['status: confirmed', 'Type:Bug']),
    issue(2, NEW, ['status: confirmed', 'Type:Bug']),
  ]);
  const times = limitWrites(github, 1, { 'retry-after': String(6 * 60 * 60) });
  assert.strictEqual(await runOnMockedClock(github), 2);
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

// The same for the reads of the discussions; `fails` tells which ones, by their rank.
function limitDiscussionReads(github, fails, headers = {}) {
  const times = [];
  const graphql = github.graphql;
  github.graphql = async (query, variables) => {
    if (isWrite(query)) return graphql(query, variables);
    times.push(Date.now());
    if (fails(times.length)) {
      throw Object.assign(new Error('You have exceeded a secondary rate limit'), { status: 403, response: { headers } });
    }
    return graphql(query, variables);
  };
  return times;
}

test('waits out a rate limit on a read and reads again', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'Type:Bug'])]);
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

test('waits out a rate limit on the read of the repository labels', async () => {
  // The labels give the id that labels a discussion.
  const github = buildGithubMock([
    issue(1, NEW, ['Type:Bug'], { pull_request: {} }),
    discussion(13823, ['Project:Webapp']),
  ]);
  const times = limitReads(github, github.rest.issues.listLabelsForRepo, 1, { 'retry-after': '120' });
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.strictEqual(times[1] - times[0], 120_000);
  assert.deepStrictEqual(github.added, ['#1 type: bug', '#13823 area: webapp']);
});

test('waits out a rate limit on the read of the discussions', async () => {
  const github = buildGithubMock([discussion(13823, ['Project:Webapp'])]);
  const times = limitDiscussionReads(github, (rank) => rank === 1, { 'retry-after': '120' });
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.strictEqual(times[1] - times[0], 120_000);
  assert.deepStrictEqual(github.added, ['#13823 area: webapp']);
});

// What github.graphql throws when GitHub answers 200 with errors in the body: no
// status, and the headers on the error itself.
const graphqlError = (message, headers = {}) =>
  Object.assign(new Error(`Request failed due to following response errors:\n - ${message}`), {
    name: 'GraphqlResponseError',
    headers,
    response: { data: null, errors: [{ message }] },
  });

test('waits out a rate limit that GraphQL answers with 200', async () => {
  // The hourly budget of GraphQL is spent: its first answer, a read, tells until when.
  const spent = buildGithubMock([discussion(13823, ['Project:Webapp'])]);
  const graphql = spent.graphql;
  const times = [];
  spent.graphql = async (query, variables) => {
    times.push(Date.now());
    if (times.length === 1) {
      const reset = String((T0 + 30 * 60_000) / 1000);
      throw graphqlError('API rate limit exceeded for installation ID 1.', { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset });
    }
    return graphql(query, variables);
  };
  assert.strictEqual(await runOnMockedClock(spent), 0);
  assert.strictEqual(times[1], T0 + 30 * 60_000);
  assert.deepStrictEqual(spent.added, ['#13823 area: webapp']);

  // A secondary limit on a write.
  const limited = buildGithubMock([discussion(13823, ['Project:Webapp'])]);
  const write = limited.graphql;
  const writes = [];
  limited.graphql = async (query, variables) => {
    if (isWrite(query) && writes.push(Date.now()) === 1) {
      throw graphqlError('You have exceeded a secondary rate limit.', { 'retry-after': '120' });
    }
    return write(query, variables);
  };
  assert.strictEqual(await runOnMockedClock(limited), 0);
  assert.deepStrictEqual(writes, [T0, T0 + 120_000]);
  assert.deepStrictEqual(limited.added, ['#13823 area: webapp']);
});

test('fails when a read is rate limited for longer than the run', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'Type:Bug'])]);
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

  // Labels that cannot be read must not read as "no label to give a discussion".
  const unread = buildGithubMock([discussion(13823, ['Project:Webapp'])]);
  limitReads(unread, unread.rest.issues.listLabelsForRepo, 1, { 'retry-after': String(6 * 60 * 60) });
  await assert.rejects(runOnMockedClock(unread), /longer than this run/);
  assert.deepStrictEqual(unread.added, []);

  // Discussions that cannot be read must not read as "none carries an old label":
  // neither at the start nor before the old labels are deleted.
  for (const rank of [1, 2]) {
    const unlisted = buildGithubMock([discussion(13823, ['Project:Webapp'], { ignoresWrites: true })]);
    limitDiscussionReads(unlisted, (read) => read === rank, { 'retry-after': String(6 * 60 * 60) });
    await assert.rejects(runOnMockedClock(unlisted), /longer than this run/);
    assert.strictEqual(unlisted.added.length, rank - 1);
  }
});

test('fails on an error other than a rate limit', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'Type:Bug'])]);
  github.rest.issues.addLabels = async () => {
    throw Object.assign(new Error('Resource not accessible by integration'), { status: 403 });
  };
  await assert.rejects(run(github), /not accessible/);

  // A token that may not label the discussions.
  const refused = buildGithubMock([discussion(13823, ['Project:Webapp'])]);
  const graphql = refused.graphql;
  let attempts = 0;
  refused.graphql = async (query, variables) => {
    if (isWrite(query) && ++attempts) throw graphqlError('Resource not accessible by integration');
    return graphql(query, variables);
  };
  await assert.rejects(runOnMockedClock(refused), /not accessible/);
  assert.strictEqual(attempts, 1);
});

test('once stopped, reads no more issue history', async () => {
  const items = [
    issue(1, NEW, ['status: confirmed', 'Type:Bug']),
    issue(2, NEW, ['status: confirmed', 'Type:Feature']),
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
    issue(1, NEW, ['status: confirmed', 'Type:Bug']),
    issue(2, NEW, ['status: confirmed', 'Type:Feature']),
    issue(3, NEW, ['status: confirmed', 'Project:Isobuild']),
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

test('counts an item that still misses its new label', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'Type:Bug'], { ignoresWrites: true })]);
  assert.strictEqual(await run(github), 1);
});

test('counts a closed item that still misses its new label', async () => {
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'Type:Bug'], { ignoresWrites: true, closed: true })]);
  assert.strictEqual(await run(github), 1);
});

test('counts a discussion that still misses its new label', async () => {
  for (const closed of [false, true]) {
    const github = buildGithubMock([discussion(13823, ['Project:Webapp'], { ignoresWrites: true, closed })]);
    assert.strictEqual(await runOnMockedClock(github), 1);
  }

  // Labelled while the run was going on: the read before the deletion finds it.
  const items = [issue(1, NEW, ['status: confirmed', 'Type:Bug'])];
  const late = buildGithubMock(items);
  const reads = limitDiscussionReads(late, () => {
    if (reads.length === 2) items.push(discussion(13823, ['Project:Webapp']));
    return false;
  });
  assert.strictEqual(await runOnMockedClock(late), 1);
  assert.deepStrictEqual(late.added, ['#1 type: bug']);
});

test('a real run reads an old name as its new label too', async () => {
  // The sync could not rename these, and the issues do not show their new label yet:
  // #1 and #2 have a status, #3 is a feature request.
  const github = buildGithubMock([
    issue(1, NEW, ['triage'], { ignoresWrites: true }),
    issue(2, NEW, ['confirmed'], { ignoresWrites: true }),
    issue(3, OLD, ['status: confirmed', 'Type:Feature'], { ignoresWrites: true }),
  ]);
  assert.strictEqual(await runOnMockedClock(github), 3);
  assert.deepStrictEqual(github.added, ['#3 type: feature', '#1 status: needs-triage', '#2 status: confirmed']);
});

test('gives the new label to the items of an old label the sync could not rename', { timeout: 10000 }, async () => {
  // `status: stale` already existed, so the sync left `idle` in place.
  const github = buildGithubMock([
    issue(1, NEW, ['status: confirmed', 'idle']),
    issue(2, NEW, ['status: confirmed', 'idle', 'status: stale']),
    issue(3, NEW, ['idle'], { closed: true }),
    discussion(4, ['idle']),
  ]);
  assert.strictEqual(await run(github), 0);
  assert.deepStrictEqual(github.added, ['#1 status: stale', '#4 status: stale', '#3 status: stale']);
});

test('labels the open issues before the history of closed items', async () => {
  const github = buildGithubMock([issue(1, OLD), issue(2, NEW, ['Type:Bug'], { closed: true })]);
  assert.strictEqual(await runOnMockedClock(github), 0);
  assert.deepStrictEqual(github.added, ['#1 status: needs-triage', '#1 legacy: needs-review', '#2 type: bug']);
});

test('the dry run reads the labels as renamed, so a rename already gives the new label', async () => {
  // `triage` is renamed to `status: needs-triage` and `Type:Feature` to `type: feature`:
  // the first issue has a status, and the second is a feature request.
  const github = buildGithubMock([issue(1, NEW, ['triage']), issue(2, OLD, ['confirmed', 'Type:Feature'])]);
  assert.strictEqual(await run(github, true), 0);
});

test('reads the manifest of the repository when it is given none', async (t) => {
  // As the workflow calls it. That manifest has no rename left to do: the read is
  // answered with the test manifest.
  const readFileSync = t.mock.method(fs, 'readFileSync', () => testManifestText);
  t.mock.method(console, 'log', () => {});
  const github = buildGithubMock([issue(1, NEW, ['status: confirmed', 'idle'])]);
  assert.strictEqual(await relabel({ github, context: { repo: { owner: 'meteor', repo: 'meteor' } } }), 0);
  assert.deepStrictEqual(readFileSync.mock.calls.map((call) => call.arguments), [[MANIFEST, 'utf8']]);
  assert.deepStrictEqual(github.added, ['#1 status: stale']);
});

test('every status counts as triage, except stale', () => {
  const statuses = [...manifest.names].filter((name) => name.startsWith('status: ') && name !== 'status: stale');
  for (const name of statuses) {
    assert.strictEqual(isUntriaged(issue(1, NEW, [name])), false, name);
  }
  assert.strictEqual(isUntriaged(issue(1, NEW, ['status: stale'])), true);
});

test('every label the script adds is in the manifest', () => {
  assert.ok(manifest.names.has(NEEDS_TRIAGE));
  assert.ok(manifest.names.has(LEGACY_REVIEW));
});

test('the manifest keeps the one quoted key per line that the scripts read', () => {
  for (const line of manifestText.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    assert.match(line, /^(- name|  (color|description|from_name)): "[^"]*"$/);
  }
});
