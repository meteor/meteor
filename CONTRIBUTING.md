# Contributing to Meteor Roles

Any contribution to this repository is highly appreciated!

## Setup development env

### Clone project and create a new branch to work on

First, clone this repository and create a new branch to work on.
Branch names should start with a descriptive suffix of their intended outcome, for example:

- `feature-` for features
- `tests-` for contributions that improve testing
- `fix-` for general fixes
- `build-` for contributions that update the build process
- `ci-` for contributions that improve/update the ci

```shell
$ git clone git@github.com:Meteor-Community-Packages/meteor-roles.git
$ cd meteor-roles
$ git checkout -b fix-some-issue
```

### Initialize test app

We use a proxy Meteor application to run our tests and handle coverage etc.
This app contains several npm scripts to provide the complete toolchain that is required
for your development and testing needs.

The setup is very easy. Go into the `testapp` directory, install dependencies and link
the package:

```shell
$ cd testapp
$ meteor npm install
$ meteor npm run setup # this is important for the tools to work!
```

## Development toolchain

The `testapp` comes with some builtin scripts you can utilize during your development.
They will also be picked up by our CI during pull requests.
Therefore, it's a good call for you, that if they pass or fail, the CI will do so, too.

**Note: all tools require the npm `setup` script has been executed at least once!**

### Linter

We use `standard` as our linter. You can run either the linter or use it's autofix feature for
the most common issues:

```shell
# in testapp
$ meteor npm run lint # show only outputs
$ meteor npm run lint:fix # with fixes + outputs
```

### Tests

We provide three forms of tests: once, watch, coverage

#### Once

Simply runs the test suite once, without coverage collection:

```shell
$ meteor npm run test
```

#### Watch

Runs the test suite in watch mode, good to use during active development, where your changes
are picked up automatically to re-run the tests:

```shell
$ meteor npm run test:watch
```

#### Coverage

Runs the test suite once, including coverage report generation.
Generates an html and json report output.

```shell
$ meteor npm run test:coverage
$ meteor npm run report # summary output in console
```

If you want to watch the HTML output to find (un)covered lines, open
the file at `testapp/.coverage/index.html` in your browser.

## Open a pull request

If you open a pull request, please make sure the following requirements are met:

- the `lint` script is passing
- the `test` script is passing
- your contribution is on point and solves one issue (not multiple)
- your commit messages are descriptive and informative
- complex changes are documented in the code with comments or jsDoc-compatible documentation

Please understand, that there will be a review process and your contribution
might require changes before being merged. This is entirely to ensure quality and is
never used as a personal offense.
