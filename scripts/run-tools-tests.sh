#!/bin/bash

# XXX does anyone call this script anymore? can it be removed? former
# users should invoke 'meteor self-test' directly

# Die with message on failure, print commands being executed
trap 'echo FAILED' EXIT
set -e -u -x

cd `dirname $0`
./meteor self-test --slow

trap - EXIT
echo PASSED
