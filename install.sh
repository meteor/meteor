#!/bin/bash

cd `dirname $0`

TARGET_DIR=/usr/local/meteor

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
