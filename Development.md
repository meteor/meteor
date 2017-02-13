# Development

## Running from a Git checkout

If you want to run on the bleeding edge, or [help contribute to Meteor](Contributing.md), you
can run Meteor directly from a Git checkout using these steps:

0. **Clone from GitHub**

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

0. **_(Optional)_ Compile dependencies**

    > This optional step requires a C and C++ compiler, autotools, and scons.
    > If this step is skipped, Meteor will simply download pre-built binaries.

    To build everything from scratch (`node`, `npm`, `mongodb`, etc.) run the following:

    ```sh
    $ ./scripts/generate-dev-bundle.sh # OPTIONAL!
    ```

0. **Run a Meteor command to install dependencies**

    > If you did not compile dependencies above, this will also download the binaries.


    ```sh
    $ ./meteor --help
    ```

0. **Ready to Go!**

    Your local Meteor checkout is now ready to use!  You can use this `./meteor`
    anywhere you would normally call the system `meteor`.  For example,:

    ```sh
    $ cd my-app/
    $ /path/to/meteor-checkout/meteor run
    ```

    > _Note:_ When running from a `git` checkout, you cannot pin apps to specific
    > Meteor releases or change the release using `--release`.

## Tests

### Test against the local meteor copy

When running any of tests, be sure run them against the checked-out copy of Meteor instead of
the globally-installed version.  This means ensuring that the command is `path-to-meteor-checkout/meteor` and not just `meteor`.

This is important so that tests are run against the version in development and not the stable (installed) Meteor release.

### Running tests on Meteor core

When you are working with code in the core Meteor packages, you will want to make sure you run the
full test-suite (including the tests you added) to ensure you haven't broken anything in Meteor. The
`test-packages` command will do just that for you:

    ./meteor test-packages

Exactly in the same way that [`test-packages` works in standalone Meteor apps](https://guide.meteor.com/writing-atmosphere-packages.html#testing), the `test-packages` command will start up a Meteor app with [TinyTest](./packages/tinytest/README.md).  To view the results, just connect to `http://localhost:3000` (or your specified port) and view the results.

Specific portions of package tests can be run by passing a `<package name>` or `<package path>` to the `test-packages` command. For example, to run `mongo` tests, it's possible to run:

    ./meteor test-packages mongo

### Running Meteor Tool self-tests

While TinyTest and the `test-packages` command can be used to test internal Meteor packages, they cannot be used to test the Meteor Tool itself. The Meteor Tool is a node app that uses a home-grown "self test" system.

For even more details on how to run Meteor Tool "self tests", please refer to the [Testing section of the Meteor Tool README](https://github.com/meteor/meteor/blob/master/tools/README.md#testing).

#### Prerequisites

To reduce the size of the Meteor distribution, some parts of the self-test system must be installed separately, including `phantomjs-prebuilt` and `browserstack-webdriver`.

A notification will be displayed when attempting to use the `self-test` commands if these dependencies are not installed.  Make sure to install them into your checkout when prompted:

    ./meteor npm install -g phantomjs-prebuilt browserstack-webdriver

#### Listing available tests

To see a list of the tests which are included in the self-test system, list them with the `--list` option:

    ./meteor self-test --list

#### Running specific tests

The self-test commands support a regular-expression syntax in order to specific/search for specific tests.  For example, to search for tests starting with `a` or `b`, it's possible to run:

    ./meteor self-test "^[a-b]" --list

Simply remove the `--list` flag to actually run the matching tests.

#### Excluding specific tests

In a similar way to the method of specifying which tests TO run, there is a way to specify which tests should NOT run.  Again, using regular-expressions, this command will NOT list any tests which start with `a` or `b`:

    ./meteor self-test --exclude "^[a-b]" --list

Simply remove the `--list` flag to actually run the matching tests.

### Continuous integration

Any time a pull-request is submitted or a commit is pushed directly to the `devel` branch, continuous integration tests will be started automatically by the CI server.  These are run by [Circle CI](https://circleci.com/) and defined in the [`circle.yml` file](./circle.yml) file.  Even more specifically, the tests to run and the containers to run them under are defined in the [`/scripts/ci.sh`](scripts/ci.sh) script, which is a script which can run locally to replicate the exact tests.

Not every test which is defined in a test spec is actually ran by the CI server.  Some tests are simply too long-running and some tests are just no longer relevant.  As one particular example, there is a suite of very slow tests grouped into a `slow` designator within the test framework.  These can be executed by adding the `--slow` option to the `self-test` command.

> Please Note: Windows
>
> There is not currently a continuous integration system setup for Windows.  Additionally, not all tests are known to work on Windows.  If you're able to take time to improve those tests, it would be greatly appreciated.  Currently, there isn't an official list of known tests which do not run on Windows, but a PR to note those here and get them fixed would be ideal!