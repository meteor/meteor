#!/bin/bash

#eventually this should be the new engine way to run tests
cd $METEOR_HOME/packages

cat > settings.json <<EOF
{
"public": {
  "runId": "$RUN_ID",
  "reportTo": "$TEST_RESULT_URL"
}
}
EOF

export PATH=$METEOR_HOME:$PATH

cat settings.json
meteor --tests=test-in-phantom --settings=settings.json &
METEOR_PID=$!

sleep 2

phantomjs ./test-in-phantom/runner.js $PLATFORM

kill $METEOR_PID
rm settings.json
