# Development

This document is intended to provide instructions and helpful information for developers who are [contributing](CONTRIBUTING.md) [pull-requests](https://github.com/meteor/meteor/pulls/) (or otherwise making changes) to **Meteor Core itself (not Meteor apps)**.

As the first suggestion to the reader of this document: If, during the course of development, a Meteor-specific process is revealed which is helpful and not documented here, please consider editing this document and submitting a pull-request.  Another developer will be thankful!

## Running from a Git checkout

If you want to run on the bleeding edge, or [help contribute to Meteor](CONTRIBUTING.md), you
can run Meteor directly from a Git checkout using these steps:

1. **Clone from GitHub**

    ```sh
    $ git clone --recursive https://github.com/meteor/meteor.git
    $ cd meteor
    ```

    > ##### Important note about Git submodules!
    >
    > This repository uses Git submodules.  If you clone without the `--recursive` flag,
    > re-fetch with `git pull` or experience "`Depending on unknown package`" errors,
    > run the following in the repository root to sync things up again:
    >
    >     $ git submodule update --init --recursive

2. **Run a Meteor command to install dependencies**

    > If you did not compile dependencies above, this will also download the binaries.


    ```sh
    $ ./meteor --help
    ```

    > **Note for Windows (PowerShell):**
    >
    > * In PowerShell, use `.\meteor` (not `./meteor`).
    > * Meteor may need `7z.exe` available in your `PATH` to download/extract binaries (dev_bundle).
    >   * Verify: `where.exe 7z`
    >   * If missing, install 7-Zip and ensure it is on your PATH (for example via `choco install 7zip -y` or `scoop install 7zip`).


3. **Ready to Go!**

    Your local Meteor checkout is now ready to use!  You can use this `./meteor`
    anywhere you would normally call the system `meteor`.  For example,:

    ```sh
    $ cd my-app/
    $ /path/to/meteor-checkout/meteor run
    ```

    > _Tip 1:_ Consider making an easy-to-run alias for frequent use:
    >
    >     alias mymeteor=/path/to-meteor-checkout/meteor
    >
    > This allows the use of `mymeteor` in place of `meteor`.  To persist this
    > across shell logouts, simply add it to `~/.bashrc` or `.zshrc`.

    > _Tip 2:_ When working with meteor tool, it may be helpful to use the debugger to check what's happening. You can do this using the following flag:
    >
    >        TOOL_NODE_FLAGS="--inspect-brk" mymeteor
    >
    > Then you can use the chrome debugger inside `chrome://inspect`.

### Testing a fork branch

When reviewing a pull request or testing changes from a contributor's fork, use the `checkout-pr.js` script to set up a local branch automatically:

```sh
# From a PR URL (requires gh CLI or falls back to GitHub API via curl)
$ npm run checkout:pr -- https://github.com/meteor/meteor/pull/<PR-number>

# From a user:branch shorthand
$ npm run checkout:pr -- <user>:<branch>

# From a full fork repo URL and branch name (HTTPS)
$ npm run checkout:pr -- <fork-repo-url> <branch>

# From a full fork repo URL and branch name (SSH)
$ npm run checkout:pr -- git@github.com:<user>/<repo>.git <branch>
```

The script will:

1. Add the fork as a git remote (named after the fork owner) if not already present
2. Fetch the target branch
3. Create (or update) a local branch named `fork/<owner>/<branch>`
4. Print instructions for switching back to your previous branch

For upstream PRs (branches on `meteor/meteor` itself), the script detects the existing `origin` remote and checks out the branch directly without the `fork/` prefix.

If you run the script again for the same fork branch, it will fetch the latest changes and update the local branch.

### Notes when running from a checkout

The following are some distinct differences you must pay attention to when running Meteor from a checkout:

  * You cannot pin apps to specific Meteor releases or change the release using `--release`.

## The "Dev Bundle"

The "dev bundle" (identified as the `dev_bundle` in the folder structure) is a generated bundle of code, packages and tools which are essential to providing the functionality of the Meteor tool (`meteor`) and the app bundles which it builds.

When `meteor` is run from a checkout, a `dev_bundle` is automatically downloaded and should be sufficient for most development.  However, some more substantial changes will require rebuilding the `dev_bundle`.  This include changes to the:

* Node.js version
* npm version
* MongoDB version
* TypeScript version
* Packages [used by `meteor-tool`](scripts/dev-bundle-tool-package.js)
* Packages [used by the server bundle](scripts/dev-bundle-server-package.js)

While it may be tempting to make changes to these variables, please consider the repercussions (including compatibility and stability) and make sure to test changes extensively.  For example, major version changes (especially to Node.js and MongoDB) usually require substantial changes to other components.

### "Dev Bundle" versions

The working version number of the `dev_bundle` to be downloaded (or generated) is stored as `BUNDLE_VERSION` at the top of the [`meteor`](./meteor) script.  When submitting a pull request which changes components of the `dev_bundle`, the minor version should be bumped (at the very least).  In local development, it is advisable to use a different major version (e.g. `100.0.0`) so as not to clash with the official versions which are cached locally.

To enable caching of downloaded `dev_bundle` versions, set the `SAVE_DEV_BUNDLE_TARBALL` environment variable before running Meteor, for example:

    SAVE_DEV_BUNDLE_TARBALL=1 ./meteor

Cached versions of the `dev_bundle` are stored in the root directory of the checkout.  Keeping them around will prevent the need to re-download them when switching between branches, but they do become quite large as they collect, so delete them as necessary!

### Rebuilding the "Dev Bundle"

Rebuilding requires a C and C++ compiler, `autotools`, and `scons`.

To build everything from scratch and re-package dependencies, simply run the following script:

```sh
$ ./scripts/generate-dev-bundle.sh
```

This will generate a new tarball (`dev_bundle_<Platform>_<arch>_<version>.tar.gz`) in the root of the checkout.  Assuming you bumped the `BUNDLE_VERSION`, the new version will be extracted automatically when you run `./meteor`.  If you are rebuilding the same version (or didn't bump the version number), you should delete the existing `dev_bundle` directory to ensure the new tarball is extracted when you run `./meteor`.

### Submitting "Dev Bundle" Pull Requests

It's important to note that while `dev_bundle` pull requests are accepted/reviewed, a new `dev_bundle` can only be published to Meteor Software's Meteor infrastructure by a Meteor Software staff member. This means that the build tool and package tests of submitted `dev_bundle` pull requests will always initially fail (since the new `dev_bundle` hasn't yet been built/published by Meteor Software, which means it can't be downloaded by Meteor's continuous integration environment).

Pull requests that contain `dev_bundle` changes will be noted by repo collaborators, and a request to have a new `dev_bundle` built/published will be forwarded to Meteor Software.

## Additional documentation

The Meteor core is best documented within the code itself, however, many components also have a `README.md` in their respective directories.

Some compartmentalized portions of Meteor are broken into packages ([see a list of packages](packages/)) and almost all of them have a `README.md` within their directory.  For example, [`ddp`](packages/ddp/README.md), [`ecmascript`](packages/ecmascript/README.md) and [`tinytest`](packages/tinytest/README.md).

For the rest, try looking nearby for a `README.md`.  For example, [`isobuild`](tools/isobuild/README.md) or [`cordova`](tools/cordova/README.md).

## Tests

When running tests that use `./meteor`, be sure to run them against the checked-out copy of Meteor instead of the globally-installed version. This ensures tests run against your local development version.

The main test workflows exercise different boundaries:

| Command | Layer | Scope |
|---------|-------|-------|
| `npm run test:unit` | **Unit** (Jest) | Pure logic in `tools/`, `scripts/`, and helpers: fast, no Meteor runtime needed |
| `npm run test:e2e` | **E2E** (Jest + Playwright) | Bundler integration and skeleton apps: creates real Meteor projects, launches a browser |
| `./meteor self-test` | **Self-test** (custom) | Meteor CLI tool itself, spawns sandboxed Meteor processes to verify commands end-to-end |
| `./meteor test-packages` | **Package** (TinyTest) | Atmosphere packages in `packages/`, runs inside a Meteor app with the full reactive runtime |
| Package-local test script | **NPM package** | Tests under `npm-packages/` use the package's own scripts and runner |
| `npm run test:native -- --platform=android` | **Native smoke** (Maestro) | Installed Cordova app and hot-code-push behavior; see the [native guide](tools/native-tests/README.md) for platform setup |

### Unit tests (Jest)

Unit tests cover pure helpers, scripts, and tool logic that does not require the Meteor runtime. They use [Jest](https://jestjs.io/) configured in `tools/unit-tests/`, targeting `tools/**/*.test.js` and `scripts/**/*.test.js`.

```sh
# Install dependencies (first time)
npm run install:unit

# Run all unit tests
npm run test:unit

# Run a specific test file
npm run test:unit -- tools/path/to/file.test.js

# Run tests matching a name pattern
npm --prefix tools/unit-tests test -- tools/path/to/file.test.js -t "my test name"
```

Use the direct `--prefix` invocation for Jest options so the nested npm command
in `test:unit` does not consume flags such as `-t`. Confirm the intended cases
ran; the runner allows an empty selection to exit successfully.

For `tools/` and `scripts/`, place Jest tests next to their source using the
`*.test.js` convention. See the [unit-test guide](tools/unit-tests/README.md) and
[runner configuration](tools/unit-tests/jest.config.js) for package-specific
placement and exclusions, including scripts that use Node's test runner.

### E2E tests (Jest + Playwright)

End-to-end tests in `tools/e2e-tests/` validate that Meteor skeletons and bundler integrations work correctly. They create real Meteor apps, start dev servers, and assert behavior in a headless Chromium browser.

```sh
# Install dependencies (first time)
npm run install:e2e

# Run all E2E tests
npm run test:e2e

# List groups and run the same selection as CI
npm run test:e2e:groups
npm run test:e2e:group -- react_vue

# Verify that every registered test has exactly one group
npm run test:e2e:groups:audit
```

Group definitions live in `tools/e2e-tests/test-groups.js`; CI generates its
matrix from the same module used by the local runner. Accounts has its own
`accounts` group and workflow. New unassigned tests run in an `uncategorized`
fallback job, and the audit reports them. See the [E2E README](tools/e2e-tests/README.md)
for file filters, CI settings, and how to add groups. App fixtures live in
`tools/e2e-tests/apps/`.

### Self-tests (Meteor tool)

The Meteor CLI has its own "self-test" framework that spawns sandboxed Meteor processes. It tests commands like `create`, `build`, `deploy`, and `publish`.

```sh
# List all self-tests
./meteor self-test --list

# Run all self-tests
./meteor self-test

# Run tests matching a regex
./meteor self-test "^[a-b]"

# Exclude tests matching a regex
./meteor self-test --exclude "^[a-b]"

# Skip retries during development
./meteor self-test --retries 0
```

### Package tests (TinyTest)

When working with core Atmosphere packages, use `test-packages` to run their tests via [TinyTest](./packages/tinytest/README.md). This starts a Meteor app, view results at `http://localhost:3000`.

```sh
# Test all packages
./meteor test-packages

# Test a specific package
./meteor test-packages mongo

# Filter by a case-sensitive test-name substring, using --filter or -f
./meteor test-packages mongo --filter "collection - call new Mongo.Collection"

# Equivalent using the environment variable
TINYTEST_FILTER="collection - call new Mongo.Collection" ./meteor test-packages mongo
```

For headless console output:

```sh
PUPPETEER_DOWNLOAD_PATH=~/.npm/chromium ./packages/test-in-console/run.sh
```

### Continuous integration

CI is defined in [GitHub Actions workflows](.github/workflows/). Each workflow's
event and path filters determine when it runs. Reproduce a failure using the
affected job's command, environment, test selection, and platform.

The [Test Tools workflow](.github/workflows/test-tools.yml) builds a self-test
matrix from filtered discovery, groups tests by source file, and runs cases
requiring isolation in separate jobs. Tags and exclusions limit the selection;
for example, `slow` self-tests require `--slow`.

[Windows Selftest](.github/workflows/windows-selftest.yml) uses a separate
[PowerShell runner](scripts/windows/ci/test.ps1) with explicit test-name
patterns. A new self-test receives Windows CI coverage only when the workflow
triggers and those patterns select it.

The [package workflow](.github/workflows/test-packages.yml) runs a reactivity
configuration matrix controlled by `METEOR_REACTIVITY_ORDER`. The separate
[DDP workflow](.github/workflows/test-ddp-transport.yml) tests `ddp-server`
with `DDP_TRANSPORT=sockjs` and `DDP_TRANSPORT=uws`. Check the affected job's
configuration and exclusions when interpreting its results.

For other runners, consult the [unit workflow](.github/workflows/unit-tests.yml),
the [E2E group guide](tools/e2e-tests/README.md#group-definitions-and-ci), the
package-local workflows for `npm-packages/`, or the
[native CI guide](tools/native-tests/README.md#ci). Discovery, skipped cases,
and a pass on an earlier commit do not establish that the current behavior ran.

## Code style

* New contributions should follow the [Meteor Style Guide](https://github.com/meteor/javascript/) as closely as possible.
  * The Meteor Style Guide is very close to the [Airbnb Style Guide](https://github.com/airbnb/javascript) with a few notable changes.
* New code should match existing code (in the same vicinity) when the context of a change is minimal, but larger amounts of new code should follow the guide.
* Do not change code that doesn't directly relate to the feature/bug that you're working on.
* Basic linting is accomplished (via ESLint) by running `./scripts/admin/eslint/eslint.sh`.
  * Many files have not been converted yet and are thus [excluded](https://github.com/meteor/meteor/blob/master/.eslintignore).

## Commit messages

Good commit messages are very important and you should make sure to explain what is changing and why. The commit message should include:

* A short and helpful commit title (maximum 80 characters).
* A commit description which clearly explains the change if it's not super-obvious by the title.  Some description always helps!
* Reference related issues and pull-requests by number in the description body (e.g. "#9999").
* Add "Fixes" before the issue number if the addition of that commit fully resolves the issue.

## Release Process

Meteor releases follow a lifecycle: **beta** -> **RC (release candidate)** -> **official**. Releases are prepared on `release-<VERSION>` branches (e.g., `release-3.4.1`) and compared against the `devel` branch.

Three AI skills support this process. They are defined as markdown files under `.github/skills/` and can be used by any AI coding assistant that supports reading project context. Trigger them from any session on a release branch.

### AI Skills for Releases

| Skill | Purpose | Skill File |
|-------|---------|------------|
| [changelog](.github/skills/changelog/SKILL.md) | Generate and update changelog entries from merged PRs | `v3-docs/docs/generators/changelog/versions/` |
| [version-bump](.github/skills/version-bump/SKILL.md) | Bump package versions for beta, RC, or official releases | `packages/*/package.js`, release config files |
| [docs-gap](.github/skills/docs-gap/SKILL.md) | Identify missing user-facing documentation for release changes | Produces a gap report in `docs/plans/` |

### Preparing a Beta Release

A beta is the first prerelease for a new version. It bumps all changed packages with a `-betaXXX.0` suffix.

**Step 1 — Update the changelog:**

```
Update the changelog for 3.4.1 from the current branch compared to devel.
Check all merged PRs and complete with the missing fixes and features.
```

**Step 2 — Bump versions:**

```
Apply the version-bump skill for a beta.0 release on this branch against devel.
```

Claude will analyze each changed package, determine patch vs minor bumps based on the diff, present a table with reasons, and apply after confirmation.

**Step 3 — Check for documentation gaps:**

```
Run the docs-gap skill to analyze what documentation is missing for this release.
```

### Preparing an RC Release

An RC transitions beta versions to release candidate. The base version stays the same, only the suffix changes.

**Step 1 — Update the changelog** (same as beta, catches any new PRs merged since the last beta).

**Step 2 — Bump versions:**

```
Apply the version-bump skill to move from beta to RC on this branch.
```

### Preparing an Official Release

An official release strips all prerelease suffixes and updates the release config and npm installer.

**Step 1 — Finalize the changelog:**

```
Finalize the changelog for 3.4.1 — set the release date and replace any
RC version references with final versions.
```

**Step 2 — Bump versions:**

```
Apply the version-bump skill for an official release on this branch.
```

This is a two-commit process: packages and release config first, npm installer second.

**Step 3 — Verify documentation coverage:**

```
Run the docs-gap skill and apply any missing documentation for this release.
```

### Other Useful Prompts

```
# Separate Rspack improvements from other changes in the changelog
Update the changelog separating Rspack improvements from other contributions.

# Override a specific package bump magnitude
The roles package should be a minor bump because it adds getUserIdsInRoleAsync.

# Generate the gap report without applying fixes
Run the docs-gap skill to produce a gap report only — don't write any docs yet.

# Check which packages changed vs devel
What packages have changed on this branch compared to devel?
```
