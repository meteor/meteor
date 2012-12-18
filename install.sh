#!/bin/bash

cd `dirname $0`

if [ "$PREFIX" != "" ] ; then
    PARENT="$PREFIX"
else
    PARENT="/usr/local"
fi
TARGET_DIR="$PARENT/meteor"

# XXX try to fix it up automatically?
if [ ! -d "$PARENT" -o ! -w "$PARENT" ] ; then
    echo "Can not write to $PARENT"
    exit 1
elif [ -d "$PARENT/bin" -a ! -w "$PARENT/bin" ] ; then
    echo "Can not write to $PARENT/bin"
    exit 1
fi

echo "Installing in $PARENT"

rm -rf "$TARGET_DIR"

# make sure dev bundle exists before trying to install
./meteor --version || exit 1

cp -a dev_bundle "$TARGET_DIR"
cp LICENSE.txt "$TARGET_DIR"
cp History.md "$TARGET_DIR"

function CPR {
    tar -c --exclude .meteor/local "$1" | tar -x -C "$2"
}
cp meteor "$TARGET_DIR/bin"
CPR lib "$TARGET_DIR"
CPR packages "$TARGET_DIR"
CPR examples "$TARGET_DIR"
rm -rf "$TARGET_DIR"/examples/unfinished

mkdir -p "$PARENT/bin"
rm -f "$PARENT/bin/meteor"
ln -s "$TARGET_DIR/bin/meteor" "$PARENT/bin/meteor"

# mark directory with current git sha
git rev-parse HEAD > "$TARGET_DIR/.git_version.txt"
