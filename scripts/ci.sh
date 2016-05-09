export TIMEOUT_SCALE_FACTOR=15
export TEST_PACKAGES_EXCLUDE="less"
export SELF_TEST_EXCLUDE="^can't publish package with colons|^old cli tests|^logs - logged (in|out)|^mongo - logged (in|out)|^minifiers can't register non-js|^minifiers: apps can't use|^compiler plugins - addAssets"

# Don't print as many progress indicators
export EMACS=t

# run different jobs based on CicleCI parallel container index
case $CIRCLE_NODE_INDEX in
0)
  echo "Running test-packages"
  echo "Running self-test (1): A-Com"
  ./packages/test-in-console/run.sh
  ./meteor self-test --headless \
      --file "^[a-b]|^c[a-n]|^co[a-l]|^compiler-plugins" \
      --exclude "$SELF_TEST_EXCLUDE"
  ;;
1)
  echo "Running self-test (2): Con-K"
  echo "Running self-test (3): L-O"
  ./meteor self-test --headless \
      --file "^co[n-z]|^c[p-z]|^[d-k]" \
      --exclude "$SELF_TEST_EXCLUDE"
  ./meteor self-test --headless \
      --file "^[l-o]" \
      --exclude "$SELF_TEST_EXCLUDE"
  ;;
2)
  echo "Running self-test (4): P"
  echo "Running self-test (5): Run"
  ./meteor self-test --headless \
      --file "^p" \
      --exclude "$SELF_TEST_EXCLUDE"
  ./meteor self-test --headless \
      --file "^run" \
      --exclude "$SELF_TEST_EXCLUDE"
  ;;
3)
  echo "Running self-test (6): R-So"
  echo "Running self-test (7): Sp-Z"
  ./meteor self-test --headless \
      --file "^r(?!un)|^s[a-o]" \
      --exclude "$SELF_TEST_EXCLUDE"
  ./meteor self-test --headless \
      --file "^s[p-z]|^[t-z]|^command-line" \
      --exclude "$SELF_TEST_EXCLUDE"
  ;;
esac
