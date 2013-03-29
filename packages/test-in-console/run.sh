#!/bin/bash

cd `dirname $0`
cd ../..
export METEOR_HOME=`pwd`

export PATH=$METEOR_HOME:$PATH
# synchronously get the dev bundle and NPM modules if they're not there.
./meteor --get-ready || exit 1

export URL='http://localhost:4096/'

meteor test-packages --driver-package test-in-console -p 4096 &
METEOR_PID=$!

sleep 2

phantomjs $METEOR_HOME/packages/test-in-console/runner.js
STATUS=$?

kill $METEOR_PID
exit $STATUS
