export TIMEOUT_SCALE_FACTOR=10
export TEST_PACKAGES_EXCLUDE="less"
export SELF_TEST_EXCLUDE="^can't publish package with colons|^old cli tests|^logs - logged out|^mongo - logged out|^minifiers can't register non-js|^minifiers: apps can't use"

# run different jobs based on CicleCI parallel container index
case $CIRCLE_NODE_INDEX in
0)
  echo "Running test-packages"
  ./packages/test-in-console/run.sh
  ;;
1)
  echo "Running self-test (1): A-C"
  ./meteor self-test --file "^[a-c]" --exclude "$SELF_TEST_EXCLUDE"
  ;;
2)
  echo "Running self-test (2): D-P"
  ./meteor self-test --file "^[d-p]" --exclude "$SELF_TEST_EXCLUDE"
  ;;
3)
  echo "Running self-test (3): R-Z"
  ./meteor self-test --file "^[r-z]" --exclude "$SELF_TEST_EXCLUDE"
  ;;
esac
