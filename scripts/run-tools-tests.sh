#!/bin/bash

## Setup
cd `dirname $0`
METEOR_DIR=`pwd`/..
# Die with message on failure, print commands being executed
trap 'echo FAILED' EXIT
set -e -u -x

# linux mktemp requires at least 3 X's in the last component.
make_temp_dir() {
  mktemp -d -t $1.XXXXXX
}

## Test the Meteor CLI from an installed tools (tests loading packages
## into the warehouse). Notably
TEST_TMPDIR=$(make_temp_dir meteor-installed-cli-tests)
TOOLS_DIR="$TEST_TMPDIR/tools-tree"
TARGET_DIR="$TOOLS_DIR" admin/build-tools-tree.sh

# Create a warehouse.
export METEOR_WAREHOUSE_DIR=$(make_temp_dir meteor-installed-cli-tests-warehouse)
# Download a bootstrap tarball into it. (launch-meteor recreates the directory.)
rmdir "$METEOR_WAREHOUSE_DIR"
admin/launch-meteor --version  # downloads the bootstrap tarball
export METEOR_DIR="$TOOLS_DIR/bin"
./cli-test.sh
unset METEOR_WAREHOUSE_DIR
unset METEOR_DIR


## Bundler unit tests
./bundler-test.sh

## Test the Meteor CLI from a checkout. We do this last because it is least likely to fail.
./cli-test.sh


## Done
trap - EXIT
echo PASSED

