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

DIR="skel with spaces"
$METEOR create "$DIR"
test -d "$DIR"
test -f "$DIR/$DIR.js"

## Tests in a meteor project
cd "$DIR"

echo "... add/remove/list"

$METEOR list | grep "backbone" > /dev/null
! $METEOR list --using 2>&1 | grep "backbone" > /dev/null
$METEOR add backbone 2>&1 | grep "backbone:" > /dev/null
$METEOR list --using | grep "backbone" > /dev/null
grep backbone .meteor/packages > /dev/null
$METEOR remove backbone 2>&1 | grep "backbone: removed" > /dev/null
! $METEOR list --using 2>&1 | grep "backbone" > /dev/null

echo "... bundle"

$METEOR bundle foo.tar.gz
test -f foo.tar.gz


echo "... run"

MONGOMARK='--bind_ip 127.0.0.1 --smallfiles --port 9102'
# kill any old test meteor
# there is probably a better way to do this, but it is at least portable across macos and linux
ps ax | grep -e 'meteor.js -p 9100' | grep -v grep | awk '{print $1}' | xargs kill

! $METEOR mongo > /dev/null 2>&1
$METEOR reset > /dev/null 2>&1

test ! -d .meteor/local
! ps ax | grep -e "$MONGOMARK" | grep -v grep > /dev/null

PORT=9100
$METEOR -p $PORT > /dev/null 2>&1 &
METEOR_PID=$!

sleep 1 # XXX XXX lame

test -d .meteor/local/db
ps ax | grep -e "$MONGOMARK" | grep -v grep > /dev/null
curl -s "http://localhost:$PORT" > /dev/null

echo "show collections" | $METEOR mongo

# kill meteor, see mongo is still running
kill $METEOR_PID

sleep 10 # XXX XXX lame. have to wait for inner app to die via keepalive!

! ps ax | grep "$METEOR_PID" | grep -v grep > /dev/null
ps ax | grep -e "$MONGOMARK"  | grep -v grep > /dev/null


echo "... rerun"

$METEOR -p $PORT > /dev/null 2>&1 &
METEOR_PID=$!

sleep 1 # XXX XXX lame

ps ax | grep -e "$MONGOMARK" | grep -v grep > /dev/null
curl -s "http://localhost:$PORT" > /dev/null

kill $METEOR_PID
ps ax | grep -e "$MONGOMARK" | grep -v grep | awk '{print $1}' | xargs kill




# XXX more tests here!



## Cleanup
trap - EXIT
rm -rf "$DIR"
echo PASSED
