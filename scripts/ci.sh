export TIMEOUT_SCALE_FACTOR=15
export TEST_PACKAGES_EXCLUDE="less"
export SELF_TEST_EXCLUDE="^can't publish package with colons|^old cli tests|^logs - logged (in|out)|^mongo - logged (in|out)|^minifiers can't register non-js|^minifiers: apps can't use|^compiler plugins - addAssets"

# Don't print as many progress indicators
export EMACS=t

# Since PhantomJS has been removed from dev_bundle/lib/node_modules
# (#6905), but self-test still needs it, install it now.
./meteor npm install -g phantomjs-prebuilt

# run different jobs based on CicleCI parallel container index
case $CIRCLE_NODE_INDEX in
0)
  echo "Running warehouse self-tests"
  ./meteor self-test --headless \
      --with-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
  ;;
1)
  echo "Running self-test (1): A-Com"
  ./meteor self-test --headless \
      --file "^[a-b]|^c[a-n]|^co[a-l]|^compiler-plugins" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
  ;;
2)
  echo "Running self-test (2): Con-K"
  ./meteor self-test --headless \
      --file "^co[n-z]|^c[p-z]|^[d-k]" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
  ;;
3)
  echo "Running self-test (3): L-O"
  ./meteor self-test --headless \
      --file "^[l-o]" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
  ;;
4)
  echo "Running self-test (4): P"
  ./meteor self-test --headless \
      --file "^p" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
  ;;
5)
  echo "Running self-test (5): Run"
  ./meteor self-test --headless \
      --file "^run" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
  ;;
6)
  echo "Running self-test (6): R-S"
  ./meteor self-test --headless \
      --file "^r(?!un)|^s" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
  ;;
7)
  echo "Running self-test (7): Sp-Z"
  ./meteor self-test --headless \
      --file "^[t-z]|^command-line" \
      --without-tag "custom-warehouse" \
      --exclude "$SELF_TEST_EXCLUDE"
  ;;
esac
