#!/bin/bash

# Run this script on Mac/Linux, not on Windows
# Requires awscli to be installed and an appropriate ~/.aws/config.
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
DIRNAME=$(aws s3 ls s3://com.meteor.jenkins/ | perl -nle 'print $1 if m!/(installer-windows--.+--.+--'$1'--.+)/!')
RELEASE=$(echo $DIRNAME | perl -pe 's/^installer-windows--(.+)--.+--.+--.+$/$1/')

if [ -z "$DIRNAME" ]; then
    echo "build not found" 1>&2
    exit 1
fi

echo Found build "$DIRNAME"

# aws s3 ls returns 0 when it lists nothing
if [[ $(aws s3 ls "s3://com.meteor.jenkins/$DIRNAME/InstallMeteor.exe" | wc -l) == 0 ]] then
  echo "InstallMeteor.exe wasn't found in $DIRNAME, did Jenkins job fail?"
  exit 1
fi

aws s3 cp --acl public-read --recursive "s3://com.meteor.jenkins/$DIRNAME/" "$TARGET$RELEASE/"

