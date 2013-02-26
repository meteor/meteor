#!/bin/bash

## Setup
METEOR_DIR=`pwd`/..
# Die with message on failure, print commands being executed
trap 'echo FAILED' EXIT
set -e -x

# linux mktemp requires at least 3 X's in the last component.
make_temp_dir() {
  mktemp -d -t $1.XXXXXX
}

## Test the Meteor CLI from an installed engine (tests loading packages
## into the warehouse). Notably
TMPDIR=$(make_temp_dir meteor-installed-cli-tests)
ENGINE_DIR="$TMPDIR/engine-tree"
TARGET_DIR="$ENGINE_DIR" admin/build-engine-tree.sh

export TEST_WAREHOUSE_DIR=$(make_temp_dir meteor-installed-cli-tests-warehouse) # run with empty warehouse
export METEOR_DIR="$ENGINE_DIR/bin"
./cli-test.sh
unset TEST_WAREHOUSE_DIR
unset METEOR_DIR


## Bundler unit tests
./bundler-test.sh

## Test the Meteor CLI from a checkout. We do this last because it is least likely to fail.
./cli-test.sh


## Done
trap - EXIT
echo PASSED

