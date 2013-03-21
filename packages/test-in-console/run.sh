#!/bin/bash

cd `dirname $0`
cd ../..
export METEOR_HOME=`pwd`

export PATH=$METEOR_HOME:$PATH
./meteor --version 2>&1 | grep Unreleased || exit 1 # syncronously get the dev bundle if its not there.

export URL='http://localhost:4096/'

meteor test-packages --driver-package test-in-console -p 4096 &
METEOR_PID=$!

sleep 2

phantomjs $METEOR_HOME/packages/test-in-console/runner.js
STATUS=$?

kill $METEOR_PID
exit $STATUS
