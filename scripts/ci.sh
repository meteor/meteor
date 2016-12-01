#!/bin/sh

#
# Optional Environment Variables for Configuration
#
# - TIMEOUT_SCALE_FACTOR: (default: 15)
#   A multiplation factor that can be used to raise the wait-time on
#   various longer-running tests.  Useful for slower (or faster!) hardware.
# - ADDL_SELF_TEST_EXCLUDE: (optional)
#   A list of additional regexes to skip, in addition to the defaults.

# Export this one so it's available in the node environment.
export TIMEOUT_SCALE_FACTOR=${TIMEOUT_SCALE_FACTOR:-15}

# Define the default tests which will be skipped.  One per line.
test -z "$SELF_TEST_EXCLUDE" && read -r -d '' SELF_TEST_EXCLUDE <<-'EOF'
^can't publish package with colons
^compiler plugins - addAssets
^logs - logged (in|out)
^minifiers can't register non-js
^minifiers: apps can't use
^mongo - logged (in|out)
^old cli tests
EOF

# Helper function to join lines.
joinLines () {
  joined=""
  IFS="$(printf '\n ')" && IFS="${IFS% }"
  for add in $1
  do
    joined="${joined:+${joined}${2:-,}}${add}"
  done
  unset IFS
  echo "$joined"
}

# Merge tests into a single, one-line regex.
SELF_TEST_EXCLUDE=$(joinLines "$SELF_TEST_EXCLUDE" "|")

# Add additional tests.
if ! [ -z "$ADDL_SELF_TEST_EXCLUDE" ]; then
  SELF_TEST_EXCLUDE=(
    "${SELF_TEST_EXCLUDE}|$(joinLines "$ADDL_SELF_TEST_EXCLUDE")"
  )
fi

# Don't print as many progress indicators
export EMACS=t

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

if should_run_test 0; then
  echo "Running warehouse self-tests"
  ./meteor self-test --headless \
      --with-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
fi

if should_run_test 1; then
  echo "Running self-test (1): A-Com"
  ./meteor self-test --headless \
      --file "^[a-b]|^c[a-n]|^co[a-l]|^compiler-plugins" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
fi

if should_run_test 2; then
  echo "Running self-test (2): Con-K"
  ./meteor self-test --headless \
      --file "^co[n-z]|^c[p-z]|^[d-k]" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
fi

if should_run_test 3; then
  echo "Running self-test (3): L-O"
  ./meteor self-test --headless \
      --file "^[l-o]" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
fi

if should_run_test 4; then
  echo "Running self-test (4): P"
  ./meteor self-test --headless \
      --file "^p" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
fi

if should_run_test 5; then
  echo "Running self-test (5): Run"
  ./meteor self-test --headless \
      --file "^run" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
fi

if should_run_test 6; then
  echo "Running self-test (6): R-S"
  ./meteor self-test --headless \
      --file "^r(?!un)|^s" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
fi

if should_run_test 7; then
  echo "Running self-test (7): Sp-Z"
  ./meteor self-test --headless \
      --file "^[t-z]|^command-line" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
fi