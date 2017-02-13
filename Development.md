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

### Running tests on Meteor core

When you are working with code in the core Meteor packages, you will want to make sure you run the
full test-suite (including the tests you added) to ensure you haven't broken anything in Meteor. The
`test-packages` command will do just that for you.

The test packages command will start up a Meteor app with TinyTest setup, just connect to
http://localhost:3000 or your specified port, like you would do with a normal meteor app.

#### Run against your local meteor copy

When running `test-packages`, be sure that you use the current directory copy of Meteor instead of
the installed version. Here is the INCORRECT way: `meteor test-packages`.

The CORRECT way is to use `./meteor test-packages` to run the full test suite against the branch you
are on.

This is important because you want to make sure you are running the test-packages command against
the Meteor code on the branch you have pulled from GitHub, rather than the stable Meteor release you
have installed on your computer.

#### Running a subset of tests

You can also just run a subset of tests from one package to speed up testing time. Let's say for
example that you just want to run the Spacebars test suite. Just simple do `./meteor test-packages
./packages/spacebars-tests` and it will just run the test files from that one package. You can
examine the `package.js` file for the `onTest` block, it outlines all the test files that should be
run.

### Running Meteor Tool tests

While TinyTest and the `test-packages` command can be used to test internal Meteor packages, they cannot be used to test the Meteor Tool itself. The Meteor Tool is a node app that uses a home-grown "self test" system. For details on how to run Meteor Tool "self tests", please refer to the [Testing section of the Meteor Tool README](https://github.com/meteor/meteor/blob/master/tools/README.md#testing).
