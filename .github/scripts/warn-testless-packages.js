/**
 * Warn about changes to packages that have no Package.onTest block.
 *
 * Checks every package directory touched by the PR. If a package's package.js
 * does not define Package.onTest (or no package.js exists), it is considered
 * testless and a PR comment is posted (or updated if already present).
 *
 * This script is intended to be called via actions/github-script:
 *   const script = require('./.github/scripts/warn-testless-packages.js')
 *   await script({github, context})
 */
module.exports = async ({ github, context }) => {
  const { owner, repo } = context.repo;
  const pullNumber = context.payload.pull_request.number;
  const headSha = context.payload.pull_request.head.sha;

  const MARKER = "<!-- warn-testless-packages -->";

  // ── 1. Collect all files changed by this PR ──────────────────────────────

  let page = 1;
  const allFiles = [];
  while (true) {
    const { data } = await github.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
      page,
    });
    if (!data.length) break;
    allFiles.push(...data);
    if (data.length < 100) break;
    page++;
  }

  // ── 2. Extract unique package directory names ─────────────────────────────

  const changedPackages = new Set();
  for (const file of allFiles) {
    const match = file.filename.match(/^packages\/([^/]+)\//);
    if (match) {
      changedPackages.add(match[1]);
    }
  }

  if (changedPackages.size === 0) return;

  // ── 3. Identify testless packages ─────────────────────────────────────────

  const testlessPackages = [];

  for (const pkg of changedPackages) {
    let content = null;
    try {
      const { data } = await github.rest.repos.getContent({
        owner,
        repo,
        path: `packages/${pkg}/package.js`,
        ref: headSha,
      });
      // data.content is base64-encoded
      content = Buffer.from(data.content, "base64").toString("utf8");
    } catch (err) {
      if (err.status !== 404) throw err;
      // No package.js → treat as testless
    }

    const hasTests = content !== null && /Package\.onTest/.test(content);
    if (!hasTests) {
      testlessPackages.push(pkg);
    }
  }

  if (testlessPackages.length === 0) return;

  // ── 4. Build comment body ─────────────────────────────────────────────────

  const list = testlessPackages
    .sort()
    .map((p) => `- \`${p}\``)
    .join("\n");
  const body = [
    MARKER,
    "## ⚠️ Changes to packages without tests",
    "",
    "The following package(s) modified in this PR have no `Package.onTest`",
    "block and are **excluded from the automated test suite**:",
    "",
    list,
    "",
    "Please either:",
    "- Add a `Package.onTest` block to each package and include it in the",
    "  [`test-packages` workflow](.github/workflows/test-packages.yml), or",
    "- Make sure the change is covered by tests in another package that",
    "  depends on this one and is already in the test matrix.",
  ].join("\n");

  // ── 5. Post or update the PR comment ─────────────────────────────────────

  let commentPage = 1;
  let existing = null;
  while (!existing) {
    const { data: comments } = await github.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
      per_page: 100,
      page: commentPage,
    });
    if (!comments.length) break;
    existing = comments.find((c) => c.body.includes(MARKER)) || null;
    if (comments.length < 100) break;
    commentPage++;
  }

  if (existing) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  } else {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
  }
};
