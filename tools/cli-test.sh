#!/bin/bash

# NOTE: by default this tests the working copy, not the installed meteor.
# To test the installed meteor, pass in --global

cd `dirname $0`
METEOR_DIR=`pwd`/..
METEOR=$METEOR_DIR/meteor

if [ -z "$NODE" ]; then
    NODE=`pwd`/node.sh
fi

#If this ever takes more options, use getopt
if [ "$1" == "--global" ]; then
    METEOR_DIR=/usr/local/meteor
    METEOR=/usr/local/bin/meteor
fi

DIR=`mktemp -d -t meteor-cli-test-XXXXXXXX`
trap 'echo FAILED ; rm -rfd `find $METEOR_DIR -name __tmp`; rm -rf "$DIR" >/dev/null 2>&1' EXIT

cd "$DIR"
set -e -x

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
# (the || true is needed on linux, whose xargs will invoke kill even with no args)
ps ax | grep -e 'meteor.js -p 9100' | grep -v grep | awk '{print $1}' | xargs kill || true

! $METEOR mongo > /dev/null 2>&1
$METEOR reset > /dev/null 2>&1

test ! -d .meteor/local
! ps ax | grep -e "$MONGOMARK" | grep -v grep > /dev/null

PORT=9100
$METEOR -p $PORT > /dev/null 2>&1 &
METEOR_PID=$!

sleep 2 # XXX XXX lame

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

sleep 2 # XXX XXX lame

ps ax | grep -e "$MONGOMARK" | grep -v grep > /dev/null
curl -s "http://localhost:$PORT" > /dev/null

kill $METEOR_PID
sleep 10 # XXX XXX lame. have to wait for inner app to die via keepalive!

ps ax | grep -e "$MONGOMARK" | grep -v grep | awk '{print $1}' | xargs kill || true
sleep 2 # need to make sure these kills take effect

echo "... mongo message"

# Run a server on the same port as mongod, so that mongod fails to start up. Rig
# it so that a single connection will cause it to exit.
$NODE -e 'require("net").createServer(function(){process.exit(0)}).listen('$PORT'+2, "127.0.0.1")' &

sleep 1

$METEOR -p $PORT > error.txt || true

grep 'port was closed' error.txt > /dev/null

# Kill the server by connecting to it.
$NODE -e 'require("net").connect({host:"127.0.0.1",port:'$PORT'+2},function(){process.exit(0);})'

echo "... settings"

cat > settings.json <<EOF
{ "foo" : "bar",
  "baz" : "quux"
}
EOF

cat > settings.js <<EOF
if (Meteor.isServer) {
  Meteor.startup(function () {
    if (!Meteor.settings) process.exit(1);
    if (Meteor.settings.foo !== "bar") process.exit(1);
    process.exit(0);
  });
}
EOF

$METEOR -p $PORT --settings='settings.json' --once > /dev/null


# prepare die.js so that we have a server that loads packages and dies
cat > die.js <<EOF
if (Meteor.isServer)
  process.exit(1);
EOF


echo "... local-package-sets -- new package"

mkdir -p $METEOR_DIR/local-package-sets/__tmp/a-package-named-bar/
cat > $METEOR_DIR/local-package-sets/__tmp/a-package-named-bar/package.js <<EOF
console.log("loaded a-package-named-bar");
EOF

$METEOR add a-package-named-bar > /dev/null
$METEOR -p $PORT --once | grep "loaded a-package-named-bar" > /dev/null

rm -rf $METEOR_DIR/local-package-sets/__tmp/


echo "... local-package-sets -- overridden package"

mkdir -p $METEOR_DIR/local-package-sets/__tmp/accounts-ui/
cat > $METEOR_DIR/local-package-sets/__tmp/accounts-ui/package.js <<EOF
Package.describe({
  summary: "accounts-ui - overridden"
});

EOF

$METEOR add accounts-ui 2>&1 | grep "accounts-ui - overridden" > /dev/null
$METEOR list | grep "accounts-ui - overridden" > /dev/null

rm -rf $METEOR_DIR/local-package-sets/__tmp/


# remove die.js, we're done with package tests.
rm die.js




## Cleanup
trap - EXIT
rm -rf "$DIR"
echo PASSED
