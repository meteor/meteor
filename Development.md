# Development

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
