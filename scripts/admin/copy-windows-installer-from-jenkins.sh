#!/bin/bash

# Run this script on Mac/Linux, not on Windows
# Requires s3cmd to be installed and an appropriate ~/.s3cfg.
# Usage:
#    scripts/admin/copy-windows-installer-from-jenkins.sh BUILDNUMBER
# where BUILDNUMBER is the small integer Jenkins build number.

set -e
set -u

cd "$(dirname "$0")"

TARGET="s3://meteor-windows/installers/"

if [ $# -ne 1 ]; then
    echo "usage: $0 jenkins-build-number" 1>&2
    exit 1
fi

# installer-windows--${METEOR_RELEASE}--${BUILD_ID}--${BUILD_NUMBER}--${GIT_COMMIT}
DIRNAME=$(s3cmd ls s3://com.meteor.jenkins/ | perl -nle 'print $1 if m!/(installer-windows--.+--.+--'$1'--.+)/!')
RELEASE=$(echo $DIRNAME | perl -pe 's/^installer-windows--(.+)--.+--.+--.+$/$1/')

if [ -z "$DIRNAME" ]; then
    echo "build not found" 1>&2
    exit 1
fi

echo Found build $DIRNAME

if ! s3cmd info "s3://com.meteor.jenkins/$DIRNAME/InstallMeteor.exe"
then
  echo "InstallMeteor.exe wasn't found in $DIRNAME, did Jenkins job fail?"
  exit 1
fi

s3cmd -P cp -r s3://com.meteor.jenkins/$DIRNAME/ $TARGET$RELEASE/

