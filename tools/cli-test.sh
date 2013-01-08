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

TMPDIR=`mktemp -d -t meteor-cli-test-XXXXXXXX`
OUTPUT="$TMPDIR/output"
trap 'echo "[...]"; tail -25 $OUTPUT; echo FAILED ; rm -rfd `find $METEOR_DIR -name __tmp`; rm -rf "$TMPDIR" >/dev/null 2>&1' EXIT

cd "$TMPDIR"
set -e -x

## Begin actual tests

echo "... --help"

$METEOR --help | grep "List available" >> $OUTPUT
$METEOR run --help | grep "Port to listen" >> $OUTPUT
$METEOR test-packages --help | grep "Port to listen" >> $OUTPUT
$METEOR create --help | grep "Make a subdirectory" >> $OUTPUT
$METEOR update --help | grep "Checks to see" >> $OUTPUT
$METEOR add --help | grep "Adds packages" >> $OUTPUT
$METEOR remove --help | grep "Removes a package" >> $OUTPUT
$METEOR list --help | grep "Without arguments" >> $OUTPUT
$METEOR bundle --help | grep "Package this project" >> $OUTPUT
$METEOR mongo --help | grep "Opens a Mongo" >> $OUTPUT
$METEOR deploy --help | grep "Deploys the project" >> $OUTPUT
$METEOR logs --help | grep "Retrieves the" >> $OUTPUT
$METEOR reset --help | grep "Reset the current" >> $OUTPUT

echo "... not in dir"

$METEOR | grep "run: You're not in" >> $OUTPUT
$METEOR run | grep "run: You're not in" >> $OUTPUT
$METEOR add foo | grep "add: You're not in" >> $OUTPUT
$METEOR remove foo | grep "remove: You're not in" >> $OUTPUT
$METEOR list --using | grep "list --using: You're not in" >> $OUTPUT
$METEOR bundle foo.tar.gz | grep "bundle: You're not in" >> $OUTPUT
$METEOR mongo | grep "mongo: You're not in" >> $OUTPUT
$METEOR deploy automated-test | grep "deploy: You're not in" >> $OUTPUT
$METEOR reset | grep "reset: You're not in" >> $OUTPUT

echo "... create"

DIR="skel with spaces"
$METEOR create "$DIR"
test -d "$DIR"
test -f "$DIR/$DIR.js"

## Tests in a meteor project
cd "$DIR"
# run in a subdirectory, just to make sure this also works
cd .meteor

echo "... add/remove/list"

$METEOR list | grep "backbone" >> $OUTPUT
! $METEOR list --using 2>&1 | grep "backbone" >> $OUTPUT
$METEOR add backbone 2>&1 | grep "backbone:" | grep -v "no such package" | >> $OUTPUT
$METEOR list --using | grep "backbone" >> $OUTPUT
grep backbone packages >> $OUTPUT # remember, we are already in .meteor
$METEOR remove backbone 2>&1 | grep "backbone: removed" >> $OUTPUT
! $METEOR list --using 2>&1 | grep "backbone" >> $OUTPUT

echo "... bundle"

$METEOR bundle foo.tar.gz
test -f foo.tar.gz

cd .. # we're now back to $DIR
echo "... run"

MONGOMARK='--bind_ip 127.0.0.1 --smallfiles --port 9102'
# kill any old test meteor
# there is probably a better way to do this, but it is at least portable across macos and linux
# (the || true is needed on linux, whose xargs will invoke kill even with no args)
ps ax | grep -e 'meteor.js -p 9100' | grep -v grep | awk '{print $1}' | xargs kill || true

! $METEOR mongo >> $OUTPUT 2>&1
$METEOR reset >> $OUTPUT 2>&1

test ! -d .meteor/local
! ps ax | grep -e "$MONGOMARK" | grep -v grep >> $OUTPUT

PORT=9100
$METEOR -p $PORT >> $OUTPUT 2>&1 &
METEOR_PID=$!

sleep 2 # XXX XXX lame

test -d .meteor/local/db
ps ax | grep -e "$MONGOMARK" | grep -v grep >> $OUTPUT
curl -s "http://localhost:$PORT" >> $OUTPUT

echo "show collections" | $METEOR mongo

# kill meteor, see mongo is still running
kill $METEOR_PID

sleep 10 # XXX XXX lame. have to wait for inner app to die via keepalive!

! ps ax | grep "$METEOR_PID" | grep -v grep >> $OUTPUT
ps ax | grep -e "$MONGOMARK"  | grep -v grep >> $OUTPUT


echo "... rerun"

$METEOR -p $PORT >> $OUTPUT 2>&1 &
METEOR_PID=$!

sleep 2 # XXX XXX lame

ps ax | grep -e "$MONGOMARK" | grep -v grep >> $OUTPUT
curl -s "http://localhost:$PORT" >> $OUTPUT

kill $METEOR_PID
sleep 10 # XXX XXX lame. have to wait for inner app to die via keepalive!

ps ax | grep -e "$MONGOMARK" | grep -v grep | awk '{print $1}' | xargs kill || true
sleep 2 # need to make sure these kills take effect

echo "... test-packages"

$METEOR test-packages -p $PORT >> $OUTPUT 2>&1 &
METEOR_PID=$!

sleep 2 # XXX XXX lame

ps ax | grep -e "$MONGOMARK" | grep -v grep >> $OUTPUT
curl -s "http://localhost:$PORT" >> $OUTPUT

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

grep 'port was closed' error.txt >> $OUTPUT

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

$METEOR -p $PORT --settings='settings.json' --once >> $OUTPUT


# prepare die.js so that we have a server that loads packages and dies
cat > die.js <<EOF
if (Meteor.isServer)
  process.exit(1);
EOF


echo "... local-package-sets -- new package"

mkdir -p "$TMPDIR/local-packages/a-package-named-bar/"
cat > "$TMPDIR/local-packages/a-package-named-bar/package.js" <<EOF
console.log("loaded a-package-named-bar");
EOF

! $METEOR add a-package-named-bar >> $OUTPUT
PACKAGE_DIRS="$TMPDIR/local-packages" $METEOR add a-package-named-bar >> $OUTPUT
! $METEOR -p $PORT --once | grep "loaded a-package-named-bar" >> $OUTPUT
PACKAGE_DIRS="$TMPDIR/local-packages" $METEOR -p $PORT --once | grep "loaded a-package-named-bar" >> $OUTPUT


echo "... local-package-sets -- overridden package"

mkdir -p "$TMPDIR/local-packages/accounts-ui/"
cat > "$TMPDIR/local-packages/accounts-ui/package.js" <<EOF
Package.describe({
  summary: "accounts-ui - overridden"
});

EOF

! $METEOR add accounts-ui 2>&1 | grep "accounts-ui - overridden" >> $OUTPUT
$METEOR remove accounts-ui 2>&1 >> $OUTPUT
PACKAGE_DIRS="$TMPDIR/local-packages" $METEOR add accounts-ui 2>&1 | grep "accounts-ui - overridden" >> $OUTPUT
! $METEOR list | grep "accounts-ui - overridden" >> $OUTPUT
PACKAGE_DIRS="$TMPDIR/local-packages" $METEOR list | grep "accounts-ui - overridden" >> $OUTPUT


# remove die.js, we're done with package tests.
rm die.js




## Cleanup
trap - EXIT
rm -rf "$DIR"
echo PASSED
