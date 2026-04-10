// Tests for warn-testless-packages.js using Node's built-in test runner (node:test)

const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const scriptPath = path.join(__dirname, "..", "warn-testless-packages.js");

const MARKER = "<!-- warn-testless-packages -->";

// ── Helpers ────────────────────────────────────────────────────────────────

function buildPR({ files, contentByPath = {}, existingComments = [] }) {
  const commentStore = [...existingComments];
  let nextCommentId = 9000;

  const github = {
    rest: {
      pulls: {
        listFiles: async ({ per_page, page }) => {
          const start = (page - 1) * per_page;
          return { data: files.slice(start, start + per_page) };
        },
      },
      repos: {
        getContent: async ({ path: filePath, ref }) => {
          if (filePath in contentByPath) {
            const content = Buffer.from(contentByPath[filePath]).toString(
              "base64"
            );
            return { data: { content } };
          }
          const err = new Error("Not found");
          err.status = 404;
          throw err;
        },
      },
      issues: {
        listComments: async ({ per_page, page }) => {
          const start = (page - 1) * per_page;
          return { data: commentStore.slice(start, start + per_page) };
        },
        createComment: async ({ issue_number, body }) => {
          const comment = { id: nextCommentId++, body };
          commentStore.push(comment);
          return { data: comment };
        },
        updateComment: async ({ comment_id, body }) => {
          const idx = commentStore.findIndex((c) => c.id === comment_id);
          if (idx !== -1) commentStore[idx] = { ...commentStore[idx], body };
          return {};
        },
      },
    },
  };

  const context = {
    repo: { owner: "meteor", repo: "meteor" },
    payload: {
      pull_request: {
        number: 42,
        head: { sha: "abc123" },
      },
    },
  };

  return { github, context, getComments: () => commentStore };
}

function makeFile(filename) {
  return { filename };
}

async function runScript(opts) {
  delete require.cache[require.resolve(scriptPath)];
  const fn = require(scriptPath);
  const { github, context, getComments } = buildPR(opts);
  await fn({ github, context });
  return getComments();
}

// ── Tests ──────────────────────────────────────────────────────────────────

test("no packages/** files changed → no comment posted", async () => {
  const comments = await runScript({
    files: [makeFile("tools/foo.js"), makeFile("README.md")],
  });
  assert.equal(comments.length, 0);
});

test("package with Package.onTest → no comment posted", async () => {
  const comments = await runScript({
    files: [makeFile("packages/ddp-client/ddp_client.js")],
    contentByPath: {
      "packages/ddp-client/package.js": `
        Package.describe({ name: 'ddp-client' });
        Package.onTest(function(api) { api.use('tinytest'); });
      `,
    },
  });
  assert.equal(comments.length, 0);
});

test("package without Package.onTest → comment created listing the package", async () => {
  const comments = await runScript({
    files: [makeFile("packages/some-pkg/main.js")],
    contentByPath: {
      "packages/some-pkg/package.js": `
        Package.describe({ name: 'some-pkg' });
        // no onTest
      `,
    },
  });
  assert.equal(comments.length, 1);
  assert.ok(comments[0].body.includes(MARKER));
  assert.ok(comments[0].body.includes("`some-pkg`"));
});

test("mixed packages → only testless package is listed", async () => {
  const comments = await runScript({
    files: [
      makeFile("packages/with-tests/main.js"),
      makeFile("packages/no-tests/main.js"),
    ],
    contentByPath: {
      "packages/with-tests/package.js": `
        Package.describe({ name: 'with-tests' });
        Package.onTest(function(api) {});
      `,
      "packages/no-tests/package.js": `
        Package.describe({ name: 'no-tests' });
      `,
    },
  });
  assert.equal(comments.length, 1);
  assert.ok(
    !comments[0].body.includes("`with-tests`"),
    "with-tests should not appear"
  );
  assert.ok(comments[0].body.includes("`no-tests`"), "no-tests should appear");
});

test("package.js not found (404) → package treated as testless", async () => {
  const comments = await runScript({
    files: [makeFile("packages/missing-pkg/foo.js")],
    contentByPath: {}, // no package.js registered → 404
  });
  assert.equal(comments.length, 1);
  assert.ok(comments[0].body.includes("`missing-pkg`"));
});

test("existing marker comment → updated, not duplicated", async () => {
  const originalBody = `${MARKER}\n## old message`;
  const comments = await runScript({
    files: [makeFile("packages/no-tests/main.js")],
    contentByPath: {
      "packages/no-tests/package.js": 'Package.describe({ name: "no-tests" });',
    },
    existingComments: [{ id: 5001, body: originalBody }],
  });
  // Still exactly one comment (the original, now updated)
  assert.equal(comments.length, 1);
  assert.equal(comments[0].id, 5001);
  assert.ok(comments[0].body.includes("`no-tests`"));
  assert.ok(!comments[0].body.includes("old message"));
});

test("multiple files in same package → package listed once", async () => {
  const comments = await runScript({
    files: [
      makeFile("packages/one-pkg/a.js"),
      makeFile("packages/one-pkg/b.js"),
      makeFile("packages/one-pkg/package.js"),
    ],
    contentByPath: {
      "packages/one-pkg/package.js": 'Package.describe({ name: "one-pkg" });',
    },
  });
  assert.equal(comments.length, 1);
  // Appears exactly once in the list
  const occurrences = (comments[0].body.match(/`one-pkg`/g) || []).length;
  assert.equal(occurrences, 1);
});
