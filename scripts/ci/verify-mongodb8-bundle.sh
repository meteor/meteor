#!/usr/bin/env bash
set -euo pipefail
export USE_TEST_DEV_BUNDLE_SERVER=1
# Invoking the checkout launcher installs the selected bundle even on cache hits.
./meteor node --version
expected=$(sed -n 's/^BUNDLE_VERSION=//p' meteor)
test "$(cat dev_bundle/.bundle_version.txt)" = "$expected"
./dev_bundle/mongodb/bin/mongod --version | tee /tmp/mongodb8-version.txt
grep -q '^db version v8\.0\.29$' /tmp/mongodb8-version.txt
./dev_bundle/mongodb/bin/mongos --version | grep '^mongos version v8\.0\.29$'
printf 'Source: %s\nBundle: %s\nMongoDB: 8.0.29\n' "$(git rev-parse HEAD)" "$expected" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
