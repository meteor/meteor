#!/bin/bash

cd `dirname $0`

PARENT="/usr/local"
TARGET_DIR="/usr/local/meteor"

# XXX try to fix it up automatically?
if [ ! -d "$PARENT" -o ! -w "$PARENT" ] ; then
    echo "Can not write to $PARENT"
    exit 1
elif [ -d "$PARENT/bin" -a ! -w "$PARENT/bin" ] ; then
    echo "Can not write to $PARENT/bin"
    exit 1
fi

rm -rf "$TARGET_DIR"

# make sure dev bundle exists before trying to install
./meteor --version || exit 1

cp -a dev_bundle "$TARGET_DIR"

function CPR {
    tar -c --exclude .meteor/local "$1" | tar -x -C "$2"
}
cp meteor "$TARGET_DIR/bin"
CPR app "$TARGET_DIR"
CPR packages "$TARGET_DIR"

mkdir -p /usr/local/bin
rm -f /usr/local/bin/meteor
ln -s "$TARGET_DIR/bin/meteor" /usr/local/bin/meteor
