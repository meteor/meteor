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

The repository has four test layers, each covering a different scope:

| Command | Layer | Scope |
|---------|-------|-------|
| `npm run test:unit` | **Unit** (Jest) | Pure logic in `tools/`, `scripts/`, and helpers: fast, no Meteor runtime needed |
| `npm run test:e2e` | **E2E** (Jest + Playwright) | Bundler integration and skeleton apps: creates real Meteor projects, launches a browser |
| `./meteor self-test` | **Self-test** (custom) | Meteor CLI tool itself, spawns sandboxed Meteor processes to verify commands end-to-end |
| `./meteor test-packages` | **Package** (TinyTest) | Atmosphere packages in `packages/`, runs inside a Meteor app with the full reactive runtime |

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
npm run test:unit -- -t "my test name"
```

Place test files next to the module they test using the `*.test.js` naming convention. Jest will pick them up automatically.

### E2E tests (Jest + Playwright)

End-to-end tests in `tools/modern-tests/` validate that Meteor skeletons and bundler integrations work correctly. They create real Meteor apps, start dev servers, and assert behavior in a headless Chromium browser.

```sh
# Install dependencies (first time)
npm run install:e2e

# Run all E2E tests
npm run test:e2e

# Run a specific suite
npm run test:e2e -- -t="React"
```

Each test has a corresponding app fixture in `tools/modern-tests/apps/`. See that directory for examples when adding new E2E tests.

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

# Filter by test name (supports regex), using --filter or -f
./meteor test-packages --filter "collection - call new Mongo.Collection"

# Equivalent using the environment variable
TINYTEST_FILTER="collection - call new Mongo.Collection" ./meteor test-packages
```

For headless console output:

```sh
PUPPETEER_DOWNLOAD_PATH=~/.npm/chromium ./packages/test-in-console/run.sh
```

### Continuous integration

Any time a pull-request is submitted or a commit is pushed directly to the `devel` branch, continuous integration tests will be started automatically by the CI server.  The tests to run and the containers to run them under are defined in the [`/scripts/ci.sh`](scripts/ci.sh) script, which is a script which can run locally to replicate the exact tests.

Not every test which is defined in a test spec is actually ran by the CI server.  Some tests are simply too long-running and some tests are just no longer relevant.  As one particular example, there is a suite of very slow tests grouped into a `slow` designator within the test framework.  These can be executed by adding the `--slow` option to the `self-test` command.

> Please Note: Windows
>
> There is not currently a continuous integration system setup for Windows.  Additionally, not all tests are known to work on Windows.  If you're able to take time to improve those tests, it would be greatly appreciated.  Currently, there isn't an official list of known tests which do not run on Windows, but a PR to note those here and get them fixed would be ideal!

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
