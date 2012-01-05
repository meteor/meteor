#!/bin/bash

# XXX this is just a placeholder!

TESTDIR=`dirname $0`
TMPDIR=`mktemp -d -t meteor-test`

cd "$TESTDIR"
cd ../..
TOPDIR=`pwd`

cp -r examples/todos2 "$TMPDIR"
cd "$TMPDIR/todos2"
rm -rf .meteor/local

"$TOPDIR/meteor" &
METEOR_PID=$!

echo "Running $METEOR_PID"

sleep 2

cd $TOPDIR
python ./tests/selenium/todo-basic.py

echo "Killing $METEOR_PID"

kill -INT $METEOR_PID
# XXX horrible and wrong!!
killall mongod

rm -rf "$TMPDIR"
