#!/bin/bash

# Requires s3cmd to be installed and an appropriate ~/.s3cfg.
# Usage:
#    admin/copy-release-from-jenkins.sh [--prod] BUILDNUMBER
# where BUILDNUMBER is the small integer Jenkins build number.

set -e
set -u

cd `dirname $0`

TARGET="s3://com.meteor.static/test/"
TEST=no
if [ $# -ge 1 -a $1 = '--prod' ]; then
    shift
    TARGET="s3://com.meteor.static/"
else
    TEST=yes
fi

if [ $# -ne 1 ]; then
    echo "usage: $0 [--prod] jenkins-build-number" 1>&2
    exit 1
fi

DIRNAME=$(s3cmd ls s3://com.meteor.jenkins/ | perl -nle 'print $1 if m!/(release-.+--'$1'--.+)/!')

if [ -z "$DIRNAME" ]; then
    echo "build not found" 1>&2
    exit 1
fi

echo Found build $DIRNAME

# Check to make sure the proper number of each kind of file is there.
s3cmd ls s3://com.meteor.jenkins/$DIRNAME/ | \
  perl -nle '++$RPM if /\.rpm/; ++$DEB if /\.deb/; ++$TAR if /\.tar\.gz/; ++$DIR if /DIR/; END { exit !($RPM == 2 && $DEB == 2 && $TAR == 3 && $DIR == 1) }'

echo Copying to $TARGET
s3cmd -P cp -r s3://com.meteor.jenkins/$DIRNAME/ $TARGET

if [ $TEST = 'yes' ]; then
    echo Uploading modified install-s3.sh and manifest.json

    OUTDIR=$(mktemp -dt meteor-crfj)
    perl -pe 's!https://d3sqy0vbqsdhku.cloudfront.net!https://s3.amazonaws.com/com.meteor.static/test!g' install-s3.sh >$OUTDIR/install-s3.sh
    perl -pe 's!https://d3sqy0vbqsdhku.cloudfront.net!https://s3.amazonaws.com/com.meteor.static/test!g' manifest.json >$OUTDIR/manifest.json

    cd $OUTDIR
    s3cmd -P put install-s3.sh s3://com.meteor.static/test/update/
    s3cmd -P put manifest.json s3://com.meteor.static/test/update/
fi
