#!/usr/bin/env bash

# We need to set up properly Puppeteer and BrowserStack dependencies in the
# machine first.
#
# We also need to setup s3cmd and its config to be able to read the file with
# Browserstack key from S3. Only Meteor Software employees have access to this
# credentials.
#
# This script is executed in our internal machine called Jenkins V3 before
# at least every official release to be sure these tests listed below are
# passing.
#
# They will take around 26 minutes to run:
# custom-minifier.js test:custom minifier - devel vs prod (252998 ms)
# hot-code-push.js test:css hot code push (370241 ms)
# hot-code-push.js test:versioning hot code push (179834 ms)
# hot-code-push.js test:javascript hot code push (621682 ms)
# package-tests.js test:add packages client archs (164742 ms)

cd ../..

./meteor self-test \
  "css hot code push|custom minifier - devel vs prod|versioning hot code push|javascript hot code push|add packages client archs" \
  --browserstack \
  --retries 2 \
  --headless

cd scripts/admin
