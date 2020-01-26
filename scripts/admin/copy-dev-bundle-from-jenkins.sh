#!/usr/bin/env bash

# Requires awscli to be installed and an appropriate ~/.aws/config.
# Usage:
#    scripts/admin/copy-dev-bundle-from-jenkins.sh [--prod] BUILDNUMBER
# where BUILDNUMBER is the small integer Jenkins build number.

set -e
set -u

cd "`dirname "$0"`"

arg=$1

TARGET="s3://com.meteor.static/test/"
TEST=no
if [ $# -ge 1 -a ${arg} = '--prod' ]; then
    shift
    arg=$1
    TARGET="s3://com.meteor.static/"
else
    TEST=yes
fi

if [ $# -ne 1 ]; then
    echo "usage: $0 [--prod] jenkins-build-number" 1>&2
    exit 1
fi

DIRNAME=$(aws s3 ls s3://com.meteor.jenkins/ | perl -nle 'print $1 if m!(dev-bundle-.+--'${arg}'--.+)/!')

if [ -z "$DIRNAME" ]; then
    echo "build not found" 1>&2
    exit 1
fi

echo Found build $DIRNAME

trap "echo Found surprising number of tarballs." EXIT
# Check to make sure the proper number of each kind of file is there.
aws s3 ls s3://com.meteor.jenkins/$DIRNAME/ | \
  perl -nle 'if (/\.tar\.gz/) { ++$TAR } else { die "something weird" }  END { exit !($TAR == 4) }'

trap - EXIT

# This awful perl line means "print everything after the last whitespace".
for FILE in $(aws s3 ls s3://com.meteor.jenkins/$DIRNAME/ | perl -nla -e 'print $F[-1]'); do
  if aws s3 ls $TARGET$FILE >/dev/null; then
    echo "$TARGET$FILE already exists (maybe from another branch?)"
    exit 1
  fi
done

echo Copying to $TARGET
aws s3 cp --acl public-read --recursive s3://com.meteor.jenkins/$DIRNAME/ $TARGET
