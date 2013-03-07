#!/bin/bash

# This script fills TARGET_DIR with what should go into
#     /usr/local/meteor/engines/X.Y.Z
# It does not set up the top-level springboard file in
# /usr/local/meteor/engines or the /usr/local/bin/meteor symlink.

cd `dirname $0`/../..

if [ "$TARGET_DIR" == "" ] ; then
    echo 'Must set $TARGET_DIR'
    exit 1
fi

# Make sure that the entire contents $TARGET_DIR is what we placed
# there
if [ -e "$TARGET_DIR" ] ; then
    echo "$TARGET_DIR already exists"
    exit 1
fi

echo "Setting up engine tree in $TARGET_DIR"

# make sure dev bundle exists before trying to install
./meteor --version || exit 1

# The engine starts as a copy of the dev bundle.
cp -a dev_bundle "$TARGET_DIR"

# Add informational files.
cp LICENSE.txt "$TARGET_DIR"
cp History.md "$TARGET_DIR"

function CPR {
    tar -c --exclude .meteor/local "$1" | tar -x -C "$2"
}
cp meteor "$TARGET_DIR/bin"
CPR engine "$TARGET_DIR"
rm -rf "$TARGET_DIR"/engine/tests
CPR examples "$TARGET_DIR"
rm -rf "$TARGET_DIR"/examples/unfinished
rm -rf "$TARGET_DIR"/examples/other

# mark directory with current git sha
git rev-parse HEAD > "$TARGET_DIR/.git_version.txt"

# generate engine version: directory hash that depends only on file
# contents but nothing else, eg modification time
echo -n "Computing engine version... "
ENGINE_VERSION=$(git ls-tree HEAD LICENSE.txt meteor engine examples | shasum | cut -f 1 -d " ") # shasum's output looks like: 'SHA -'
echo $ENGINE_VERSION
echo -n "$ENGINE_VERSION" > "$TARGET_DIR/.engine_version.txt"
