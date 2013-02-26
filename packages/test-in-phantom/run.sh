#!/bin/bash

#eventually this should be the new engine way to run tests
cd $METEOR_HOME/packages
meteor --tests=test-in-phantom &
METEOR_PID=$!

sleep 2

phantomjs ./test-in-phantom/runner.js

kill $METEOR_PID
