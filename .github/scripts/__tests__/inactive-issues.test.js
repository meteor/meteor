// Tests for inactive-issues.js using Node's built-in test runner (node:test)
// We only care about the last comments (per user instruction), so we don't need pagination logic.

const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// Load the script dynamically so we can pass mocks.
const scriptPath = path.join(__dirname, '..', 'inactive-issues.js');

// Helper to advance days
const daysAgo = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
};

// Factory for github REST mock structure
function buildGithubMock({ issues, commentsByIssue }) {
  return {
    rest: {
      issues: {
        listForRepo: async ({ page, per_page }) => {
          // simple pagination slice
            const start = (page - 1) * per_page;
            const end = start + per_page;
            return { data: issues.slice(start, end) };
        },
        listComments: async ({ issue_number }) => {
          return { data: commentsByIssue[issue_number] || [] };
        },
        createComment: async ({ issue_number, body }) => {
          // push comment to structure to allow assertions on side effects if needed
          const arr = commentsByIssue[issue_number] || (commentsByIssue[issue_number] = []);
          arr.push({
            id: Math.random(),
            body,
            created_at: new Date().toISOString(),
            user: { login: 'github-actions[bot]', type: 'Bot' }
          });
          return {};
        },
        addLabels: async ({ issue_number, labels }) => {
          const issue = issues.find(i => i.number === issue_number);
          if (issue) {
            (issue.labels || (issue.labels = [])).push(...labels.map(l => ({ name: l })));
          }
          return {};
        }
      }
    }
  };
}

// Wrap script invocation for reuse
async function runScript({ issues, commentsByIssue }) {
  delete require.cache[require.resolve(scriptPath)];
  const fn = require(scriptPath);
  const github = buildGithubMock({ issues, commentsByIssue });
  await fn({ github, context: { repo: { owner: 'meteor', repo: 'meteor' } } });
  return { issues, commentsByIssue };
}

let baseIssueNumber = 1000;
function makeIssue({ daysSinceHumanActivity, isPR = false, labels = [], user = 'user1' }) {
  // We'll simulate by setting created_at to the human activity date if no comments.
  const updated_at = daysAgo(daysSinceHumanActivity);
  return {
    number: baseIssueNumber++,
    pull_request: isPR ? {} : undefined,
    labels: labels.map(n => ({ name: n })),
    user: { login: user },
    created_at: daysAgo(daysSinceHumanActivity),
    updated_at
  };
}

// TESTS

beforeEach(() => {
  baseIssueNumber = 1000;
});

test('60 days inactivity -> adds reminder comment (no prior reminder)', async () => {
  const issue = makeIssue({ daysSinceHumanActivity: 60 });
  const issues = [issue];
  const commentsByIssue = { [issue.number]: [] }; // no comments

  await runScript({ issues, commentsByIssue });

  const botComments = commentsByIssue[issue.number].filter(c => c.user.login === 'github-actions[bot]');
  assert.equal(botComments.length, 1, 'Should have 1 reminder comment');
  assert.match(botComments[0].body, /60 days/);
  assert.ok(!issue.labels.some(l => l.name === 'idle'), 'Should not label yet');
});

test('60 days inactivity but already reminded -> no duplicate comment', async () => {
  const issue = makeIssue({ daysSinceHumanActivity: 65 });
  const issues = [issue];
  const commentsByIssue = {
    [issue.number]: [
      {
        id: 1,
        body: '👋 @user1 This issue has been open with no human activity for 60 days. Is this issue still relevant? If there is no human response or activity within the next 30 days, this issue will be labeled as `idle`.',
        created_at: daysAgo(5), // 5 days ago bot comment (means last human is 65 days, bot after human)
        user: { login: 'github-actions[bot]', type: 'Bot' }
      }
    ]
  };

  await runScript({ issues, commentsByIssue });

  const botComments = commentsByIssue[issue.number].filter(c => c.user.login === 'github-actions[bot]');
  assert.equal(botComments.length, 1, 'Should still have only the existing reminder');
});

test('90 days inactivity -> label + comment', async () => {
  const issue = makeIssue({ daysSinceHumanActivity: 95 });
  const issues = [issue];
  const commentsByIssue = { [issue.number]: [] };

  await runScript({ issues, commentsByIssue });

  assert.ok(issue.labels.some(l => l.name === 'idle'), 'Should add idle label');
  const botComments = commentsByIssue[issue.number].filter(c => c.user.login === 'github-actions[bot]');
  assert.equal(botComments.length, 1, 'Should comment when labeling');
  assert.match(botComments[0].body, /90 days/i);
});

test('90 days inactivity but already labeled -> no action', async () => {
  const issue = makeIssue({ daysSinceHumanActivity: 100, labels: ['idle'] });
  const issues = [issue];
  const commentsByIssue = { [issue.number]: [] };

  await runScript({ issues, commentsByIssue });

  const botComments = commentsByIssue[issue.number].filter(c => c.user.login === 'github-actions[bot]');
  assert.equal(botComments.length, 0, 'Should not comment again');
});

test('90 days inactivity but already labeled `in-development` -> no action', async () => {
  const issue = makeIssue({ daysSinceHumanActivity: 100, labels: ['in-development'] });
  const issues = [issue];
  const commentsByIssue = { [issue.number]: [] };

  await runScript({ issues, commentsByIssue });

  const botComments = commentsByIssue[issue.number].filter(c => c.user.login === 'github-actions[bot]');
  assert.equal(botComments.length, 0, 'Should not comment again');
});


test('Human reply after reminder resets cycle (no immediate labeling)', async () => {
  // Scenario: last human activity 10 days ago, bot commented 40 days ago (which was 50 days after original). Should NOT comment again or label.
  const issue = makeIssue({ daysSinceHumanActivity: 10 });
  const issues = [issue];
  const commentsByIssue = {
    [issue.number]: [
      {
        id: 1,
        body: '👋 @user1 This issue has been open with no human activity for 60 days... ',
        created_at: daysAgo(50),
        user: { login: 'github-actions[bot]', type: 'Bot' }
      },
      {
        id: 2,
        body: 'I am still seeing this problem',
        created_at: daysAgo(10),
        user: { login: 'some-human', type: 'User' }
      }
    ]
  };

  await runScript({ issues, commentsByIssue });

  const botComments = commentsByIssue[issue.number].filter(c => c.user.login === 'github-actions[bot]');
  assert.equal(botComments.length, 1, 'Should not add a new bot comment');
  assert.ok(!issue.labels.some(l => l.name === 'idle'), 'Should not label');
});

test('Only bot comments (no human ever) counts from creation date', async () => {
  const issue = makeIssue({ daysSinceHumanActivity: 61 });
  const issues = [issue];
  const commentsByIssue = {
    [issue.number]: [
      {
        id: 1,
        body: 'Automated maintenance notice',
        created_at: daysAgo(30),
        user: { login: 'github-actions[bot]', type: 'Bot' }
      }
    ]
  };

  await runScript({ issues, commentsByIssue });
  const botComments = commentsByIssue[issue.number].filter(c => /60 days/.test(c.body));
  assert.equal(botComments.length, 1, 'Should add a 60-day reminder');
});
