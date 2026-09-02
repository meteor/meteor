# E2E Tests

Isolated Jest + Playwright environment for end-to-end testing Meteor skeletons and bundler integrations.

The repo root `node_modules/` is used to build the dev bundle, which becomes the Meteor tool itself. Installing test deps (jest, playwright, swc, cheerio, semver, underscore) there could pull in incompatible transitive versions (e.g. lru-cache v10 vs v5) and silently break the dev bundle build or a published Meteor release. This subfolder keeps test dependencies fully isolated so they never affect how Meteor is built or shipped.

Tests create real Meteor projects, start dev servers, and assert behavior in a headless Chromium browser.

All commands below should be run from the repo root:

```sh
# Install dependencies (first time)
npm run install:e2e

# Run all E2E tests
npm run test:e2e

# Run a specific suite
npm run test:e2e -- --testPathPattern skeleton

# Run one of the same exclusive groups used by CI
npm run test:e2e:group -- monorepo

# Audit group exclusivity and report uncategorized tests
npm run test:e2e:groups:audit
```

CI group names and their anchored Jest patterns live in `test-groups.js`.
Update that file when adding or renaming a suite; the audit rejects tests
selected by multiple jobs, empty groups, and workflow/mapping drift. CI runs
unassigned tests in the automatically derived `uncategorized` fallback group
and reports their full names as warnings. The fallback job's status reflects
whether those tests pass or fail.
