#!/usr/bin/env bash

set -e
set -u

ulimit -c unlimited; # Set core dump size as Ubuntu 14.04 lacks prlimit.
ulimit -a # Display all ulimit settings for transparency.

cd ../../
pushd tools
# Ensure that meteor/tools has no TypeScript errors.
../meteor npx tsc --noEmit
popd
./meteor --get-ready
