#!/usr/bin/env bash

set -e
set -u

ulimit -c unlimited; # Set core dump size as Ubuntu 14.04 lacks prlimit.
ulimit -a # Display all ulimit settings for transparency.

pushd tools
# Ensure that meteor/tools has no TypeScript errors.
echo "typescript compiler starting"
../meteor npx tsc --noEmit
echo "typescript compiler finished"
popd
echo "meteor get-ready starting"
./meteor --get-ready
echo "meteor get-ready finished"
