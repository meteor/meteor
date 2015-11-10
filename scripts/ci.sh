export TIMEOUT_SCALE_FACTOR=15
export TEST_PACKAGES_EXCLUDE="less"
export SELF_TEST_EXCLUDE="^can't publish package with colons|^old cli tests|^logs - logged (in|out)|^mongo - logged (in|out)|^minifiers can't register non-js|^minifiers: apps can't use|^compiler plugins - addAssets"

# run different jobs based on CicleCI parallel container index
case $CIRCLE_NODE_INDEX in
0)
  echo "Running test-packages"
  ./packages/test-in-console/run.sh
  ;;
1)
  echo "Running self-test (1): A-Com"
  ./meteor self-test --file "^[a-b]|^c[a-n]|^co[a-l]|^compiler-plugins" --exclude "$SELF_TEST_EXCLUDE"
  ;;
2)
  echo "Running self-test (2): Con-K"
  ./meteor self-test --file "^co[n-z]|^c[p-z]|^[d-k]" --exclude "$SELF_TEST_EXCLUDE"
  ;;
3)
  echo "Running self-test (3): L-O"
  ./meteor self-test --file "^[l-o]" --exclude "$SELF_TEST_EXCLUDE"
  ;;
4)
  echo "Running self-test (4): P"
  ./meteor self-test --file "^p" --exclude "$SELF_TEST_EXCLUDE"
  ;;
5)
  echo "Running self-test (5): Run"
  ./meteor self-test --file "^run" --exclude "$SELF_TEST_EXCLUDE"
  ;;
6)
  echo "Running self-test (6): R-So"
  ./meteor self-test --file "^r(?!un)|^s[a-o]" --exclude "$SELF_TEST_EXCLUDE"
  ;;
7)
  echo "Running self-test (7): Sp-Z"
  ./meteor self-test --file "^s[p-z]|^[t-z]|^command-line" --exclude "$SELF_TEST_EXCLUDE"
  ;;
esac
