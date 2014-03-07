#!/bin/bash

# This script fills TARGET_DIR with what should go into
#     ~/.meteor/tools/VERSION
# It does not set up the top-level springboard file in
# ~/.meteor/tools or the ~/.meteor/meteor symlink.

set -e
set -u

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

echo "Setting up tools tree in $TARGET_DIR"

# make sure dev bundle exists before trying to install
./meteor --get-ready

function CPR {
    tar -c --exclude .meteor/local "$1" | tar -x -C "$2"
}

# The tools starts as a copy of the dev bundle.
cp -a dev_bundle "$TARGET_DIR"
# Copy over files and directories that we want in the tarball. Keep this list
# synchronized with the files used in the $TOOLS_VERSION calculation below. The
# "meteor" script file contains the version number of the dev bundle, so we
# include that instead of the (arch-specific) bundle itself in sha calculation.
cp LICENSE.txt "$TARGET_DIR"
cp meteor "$TARGET_DIR/bin"
CPR tools "$TARGET_DIR"
CPR examples "$TARGET_DIR"
# Script is not actually used, but it's nice to distribute it for users.
cp scripts/admin/launch-meteor "$TARGET_DIR"

# Trim unfinished examples.
rm -rf "$TARGET_DIR"/examples/unfinished
rm -rf "$TARGET_DIR"/examples/other

# mark directory with current git sha
git rev-parse HEAD > "$TARGET_DIR/.git_version.txt"

# generate tools version: directory hash that depends only on file contents and
# permissions but nothing else, eg modification time or build outputs. This
# version is treated fully opaquely, so to make it a little more attractive we
# just use the first ten characters.
echo -n "Computing tools version... "
TOOLS_VERSION=$(git ls-tree HEAD \
    LICENSE.txt meteor tools examples scripts/admin/launch-meteor \
    | shasum | cut -c 1-10) # shasum's output looks like: 'SHA -'
echo $TOOLS_VERSION
echo -n "$TOOLS_VERSION" > "$TARGET_DIR/.tools_version.txt"
