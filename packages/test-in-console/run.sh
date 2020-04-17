#!/usr/bin/env bash

cd $(dirname $0)/../..
export METEOR_HOME=`pwd`

export phantom=$phantom

# only install dependencies if required
if [ "$phantom" = true ]
then
    # Just in case these packages haven't been installed elsewhere.
    ./meteor npm install -g phantomjs-prebuilt browserstack-webdriver
else
    # Installs into dev_bundle/lib/node_modules/puppeteer.
    ./meteor npm install -g puppeteer
fi

export PATH=$METEOR_HOME:$PATH
# synchronously get the dev bundle and NPM modules if they're not there.
./meteor --help || exit 1

export URL='http://localhost:4096/'

exec 3< <(meteor test-packages --driver-package test-in-console -p 4096 --exclude ${TEST_PACKAGES_EXCLUDE:-''})
EXEC_PID=$!

sed '/test-in-console listening$/q' <&3

if [ "$phantom" = true ]
then
    ./dev_bundle/bin/phantomjs "$METEOR_HOME/packages/test-in-console/phantomRunner.js"
else
    node "$METEOR_HOME/packages/test-in-console/puppeteerRunner.js"
fi

STATUS=$?

pkill -TERM -P $EXEC_PID
exit $STATUS
