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
## into the warehouse)
TMPDIR=$(make_temp_dir meteor-installed-cli-tests)
export ENGINE_DIR=$TMPDIR/engine-tree
TARGET_DIR=$ENGINE_DIR admin/build-engine-tree.sh

export TEST_INSTALLED_METEOR=1 # to use the --release option on `meteor test-packages`
export TEST_WAREHOUSE_DIR=$(make_temp_dir meteor-installed-cli-tests-warehouse) # run with empty warehouse
METEOR_DIR=$ENGINE_DIR/bin ./cli-test.sh
unset TEST_INSTALLED_METEOR
unset TEST_WAREHOUSE_DIR

## Run bundler unit tests
./bundler-test.sh


## Test all packages on a fake 0.0.1 Meteor release. Adds the
## 'kill-server-on-test-completion' package so that the server gets
## notified when tests are done.
##
## Notably this *doesn't* test the packages you are working on.  XXX
## add running tests against local packages, but make sure to isolate
## the browser runs somehow since if both tabs load
## http://localhost:3000, the second run ends prematutely. This is
## presumably somehow related to hot-code reload but I'm not totally
## confident why. -Avital
export TEST_WAREHOUSE_DIR=$(mktemp -d -t meteor-installed-cli-tests-warehouse) # run with empty warehouse

# We sleep for 30 seconds since we fetch packages on the first run,
# and only then do we listen on port 3000. In a fully installed
# version, we will have run 'meteor update' after installing the
# engine so this wouldn't happen. XXX should we test the full
# installer?
(sleep 30; open http://localhost:3000) & # XXX this won't work on Linux. need to fix.

PACKAGE_DIRS=$METEOR_DIR/tools/cli-test-packages/ $METEOR_DIR/meteor test-packages --once --release=0.0.1


## Test the Meteor CLI from a checkout. We do this last because it is least likely to fail.
./cli-test.sh


## Done
trap - EXIT
echo PASSED

