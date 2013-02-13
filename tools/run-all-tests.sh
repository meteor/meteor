#!/bin/bash

## Setup
METEOR_DIR=`pwd`/..
# Die with message on failure, print commands being executed
trap 'echo FAILED' EXIT
set -e -x


## Test the Meteor CLI from an installed engine (tests loading packages
## into the warehouse)
TMPDIR=$(mktemp -d -t meteor-installed-cli-tests)
export ENGINE_DIR=$TMPDIR/engine-tree
TARGET_DIR=$ENGINE_DIR admin/build-engine-tree.sh

export TEST_INSTALLED_METEOR=1 # to use the --release option on `meteor test-packages`
export TEST_WAREHOUSE_DIR=$(mktemp -d -t meteor-installed-cli-tests-warehouse) # run with empty warehouse
METEOR_DIR=$ENGINE_DIR/bin ./cli-test.sh


## Run bundler unit tests
./bundler-test.sh


## Test all packages on installed version, adding 'kill-server-on-test-completion'
export TEST_WAREHOUSE_DIR=$(mktemp -d -t meteor-installed-cli-tests-warehouse) # run with empty warehouse

# We sleep for 30 seconds since we fetch packages on the first run,
# and only then do we listen on port 3000. In a fully installed
# version, we will have run 'meteor update' after installing the
# engine so this wouldn't happen. XXX should we test the full
# installer?
(sleep 30; open http://localhost:3000) &

PACKAGE_DIRS=$METEOR_DIR/tools/cli-test-packages/ $METEOR_DIR/meteor test-packages --once --release=0.0.1


## Test the Meteor CLI from a checkout. We do this last because it is least likely to fail.
./cli-test.sh


## Done
trap - EXIT
echo PASSED

