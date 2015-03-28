#!/bin/bash

# Requires awscli to be installed and an appropriate ~/.aws/config.
# Usage:
#    scripts/admin/copy-bootstrap-tarballs-from-jenkins.sh BUILDNUMBER
# where BUILDNUMBER is the small integer Jenkins build number.

set -e
set -u

cd "`dirname "$0"`"

TARGET="s3://com.meteor.static/packages-bootstrap/"

if [ $# -ne 1 ]; then
    echo "usage: $0 jenkins-build-number" 1>&2
    exit 1
fi

# bootstrap-tarballs--${METEOR_RELEASE}--${BUILD_ID}--${BUILD_NUMBER}--${GIT_COMMIT}
DIRNAME=$(aws s3 ls s3://com.meteor.jenkins/ | perl -nle 'print $1 if m!/(bootstrap-tarballs--.+--.+--'$1'--.+)/!')
RELEASE=$(echo $DIRNAME | perl -pe 's/^bootstrap-tarballs--(.+)--.+--.+--.+$/$1/')

if [ -z "$DIRNAME" ]; then
    echo "build not found" 1>&2
    exit 1
fi

echo "Found build $DIRNAME"


trap "echo Found surprising number of tarballs." EXIT
# Check to make sure the proper number of each kind of file is there.
aws s3 ls "s3://com.meteor.jenkins/$DIRNAME/" | \
  perl -nle 'if (/\.tar\.gz/) { ++$TAR } else { die "something weird" }  END { exit !($TAR == 4) }'

trap - EXIT

echo Copying to "$TARGET"
aws s3 cp --acl public-read --recursive "s3://com.meteor.jenkins/$DIRNAME/" "$TARGET$RELEASE"
