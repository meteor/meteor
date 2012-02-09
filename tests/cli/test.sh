#!/bin/bash

# NOTE: by default this tests the installed meteor, not the one in your
# working copy.

METEOR=/usr/local/bin/meteor

DIR=`mktemp -d -t meteor-cli-test-XXXXXXXX`
trap 'echo FAILED ; rm -rf "$DIR" >/dev/null 2>&1' EXIT

cd "$DIR"
set -e

## Begin actual tests

echo "... --help"

$METEOR --help | grep "List available" > /dev/null
$METEOR run --help | grep "Port to listen" > /dev/null
$METEOR create --help | grep "Make a subdirectory" > /dev/null
$METEOR update --help | grep "Checks to see" > /dev/null
$METEOR add --help | grep "Adds packages" > /dev/null
$METEOR remove --help | grep "Removes a package" > /dev/null
$METEOR list --help | grep "Without arguments" > /dev/null
$METEOR bundle --help | grep "Package this project" > /dev/null
$METEOR mongo --help | grep "Opens a Mongo" > /dev/null
$METEOR deploy --help | grep "Deploys the project" > /dev/null
$METEOR logs --help | grep "Retrieves the" > /dev/null
$METEOR reset --help | grep "Reset the current" > /dev/null

echo "... not in dir"

$METEOR | grep "You're not in" > /dev/null
$METEOR run | grep "You're not in" > /dev/null
$METEOR add foo | grep "You're not in" > /dev/null
$METEOR remove foo | grep "You're not in" > /dev/null
$METEOR list --using | grep "You're not in" > /dev/null
$METEOR bundle foo.tar.gz | grep "You're not in" > /dev/null
$METEOR mongo | grep "You're not in" > /dev/null
$METEOR deploy automated-test | grep "You're not in" > /dev/null
$METEOR reset | grep "You're not in" > /dev/null

echo "... create"

$METEOR create skel
test -d skel
test -f skel/model.js

## Tests in a meteor project
cd skel

echo "... add/remove/list"

$METEOR list | grep "backbone" > /dev/null
$METEOR list --using 2>&1 | grep "This project doesn't" > /dev/null
$METEOR add backbone 2>&1 | grep "backbone:" > /dev/null
$METEOR list --using | grep "backbone" > /dev/null
grep backbone .meteor/packages > /dev/null
$METEOR remove backbone 2>&1 | grep "backbone: removed" > /dev/null
$METEOR list --using 2>&1 | grep "This project doesn't" > /dev/null

echo "... bundle"

$METEOR bundle foo.tar.gz
test -f foo.tar.gz


# XXX more tests here!



## Cleanup
trap - EXIT
rm -rf "$DIR"
echo PASSED
