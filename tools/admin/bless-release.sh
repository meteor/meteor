#!/bin/bash

set -x
set -e
set -u

echo "Releasing from $1 to $2"

s3cmd -P cp "s3://com.meteor.packages/unpublished/$1/meteor-engine-bootstrap-*" \
            "s3://com.meteor.static/test/"
s3cmd -P cp "s3://com.meteor.packages/releases/$1.json" \
            "s3://com.meteor.packages/releases/$2.json"
