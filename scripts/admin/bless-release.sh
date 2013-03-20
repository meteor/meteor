#!/bin/bash

set -x
set -e
set -u

echo "Releasing from $1 to $2"

s3cmd -P cp "s3://com.meteor.warehouse/releases/$1.release.json" \
            "s3://com.meteor.warehouse/releases/$2.release.json"
s3cmd -P put notices.json "s3://com.meteor.warehouse/releases/$2.notices.json"
