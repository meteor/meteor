#!/bin/sh

#
# Optional Environment Variables for Configuration
#
# - TIMEOUT_SCALE_FACTOR: (default: 15)
#   A multiplation factor that can be used to raise the wait-time on
#   various longer-running tests.  Useful for slower (or faster!) hardware.
# - ADDL_SELF_TEST_EXCLUDE: (optional)
#   A regex or list of additional regexes to skip.

# Export this one so it's available in the node environment.
export TIMEOUT_SCALE_FACTOR=${TIMEOUT_SCALE_FACTOR:-4}

# Skip these tests always.  Add other tests with ADDL_SELF_TEST_EXCLUDE.
SELF_TEST_EXCLUDE="^old cli tests|^minifiers can't register non-js|^minifiers: apps can't use|^compiler plugins - addAssets"

# If no SELF_TEST_EXCLUDE is defined, use those defined here by default
if ! [ -z "$ADDL_SELF_TEST_EXCLUDE" ]; then
  SELF_TEST_EXCLUDE="${SELF_TEST_EXCLUDE}|${ADDL_SELF_TEST_EXCLUDE}"
fi

# Don't print as many progress indicators
export EMACS=t

export METEOR_HEADLESS=true

if [ -z "$CIRCLE_NODE_TOTAL" ] || [ -z "$CIRCLE_NODE_INDEX" ]; then
  # In the case where these aren't set, just pretend like we're a single node.
  # This is also handy if the user is using another CI service besides CircleCI
  CIRCLE_NODE_TOTAL=1
  CIRCLE_NODE_INDEX=0

  echo "[warn] CIRCLE_NODE_TOTAL or CIRCLE_NODE_INDEX was not defined.  \c"
  echo "Running all tests!"
fi

# Clear dev_bundle/.npm to ensure consistent test runs.
./meteor npm cache clear

# Since PhantomJS has been removed from dev_bundle/lib/node_modules
# (#6905), but self-test still needs it, install it now.
./meteor npm install -g phantomjs-prebuilt browserstack-webdriver

# Make sure we have initialized and updated submodules such as
# packages/non-core/blaze.
git submodule update --init --recursive

# run different jobs based on CicleCI parallel container index
should_run_test () {
  test $(($1 % $CIRCLE_NODE_TOTAL)) -eq $CIRCLE_NODE_INDEX
}

# Keep track of errors, but let the tests all finish. This is necessary since
# more than one of the following tests may be executed from a single run if
# parallelism is lower than the number of tests.
exit_code=0

# Also, if any uncaught errors slip through, fail the build.
set -e

if should_run_test 0; then
  echo "Running warehouse self-tests"
  ./meteor self-test --headless \
      --with-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE" \
    || exit_code=$?
fi

if should_run_test 1; then
  echo "Running self-test (1): A-Com"
  ./meteor self-test --headless \
      --file "^[a-b]|^c[a-n]|^co[a-l]|^compiler-plugins" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE" \
    || exit_code=$?
fi

if should_run_test 2; then
  echo "Running self-test (2): Con-K"
  ./meteor self-test --headless \
      --file "^co[n-z]|^c[p-z]|^[d-k]" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE" \
    || exit_code=$?
fi

if should_run_test 3; then
  echo "Running self-test (3): L-O"
  ./meteor self-test --headless \
      --file "^[l-o]" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE" \
    || exit_code=$?
fi

if should_run_test 4; then
  echo "Running self-test (4): P"
  ./meteor self-test --headless \
      --file "^p" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE" \
    || exit_code=$?
fi

if should_run_test 5; then
  echo "Running self-test (5): Run"
  ./meteor self-test --headless \
      --file "^run" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE" \
    || exit_code=$?
fi

if should_run_test 6; then
  echo "Running self-test (6): R-S"
  ./meteor self-test --headless \
      --file "^r(?!un)|^s" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE" \
    || exit_code=$?
fi

if should_run_test 7; then
  echo "Running self-test (7): Sp-Z"
  ./meteor self-test --headless \
      --file "^[t-z]|^command-line" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE" \
    || exit_code=$?
fi

exit $exit_code
