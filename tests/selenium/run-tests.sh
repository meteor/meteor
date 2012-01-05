#!/bin/bash

# XXX this is just a placeholder!

TESTDIR=`dirname $0`
TMPDIR=`mktemp -d -t skytest`

cd "$TESTDIR"
cd ../..
TOPDIR=`pwd`

cp -r examples/todos2 "$TMPDIR"
cd "$TMPDIR/todos2"
rm -rf .meteor/local

"$TOPDIR/meteor" &
SKY_PID=$!

echo "Running $SKY_PID"

sleep 2

cd $TOPDIR
python ./tests/selenium/todo-basic.py

echo "Killing $SKY_PID"

kill -INT $SKY_PID
# XXX horrible and wrong!!
killall mongod

rm -rf "$TMPDIR"
