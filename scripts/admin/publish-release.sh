#!/bin/bash
set -e
set -u
cd `dirname $0`
DIR="$(pwd)"
METEOR_DIR="$(pwd)/../.."

if [ $# -gt 2 ]; then
  echo "usage: publish-release.sh [GIT-REV [RELEASE-NAME]]"
  exit 1
fi

if [ $# -lt 1 ]; then
  GIT_SHA="$(git rev-parse HEAD)"
else
  GIT_SHA="$(git rev-parse "$1")"
fi

if [ $# -lt 2 ]; then
  RELEASE_NAME="$GIT_SHA"
else
  RELEASE_NAME="$2"
fi

# prepare settings file with git sha of last commit
PUBLISH_TMPDIR=$(mktemp -d -t meteor-publish-release-XXXXXXXX)
cat > "$PUBLISH_TMPDIR/settings.json" <<EOF
{"git-sha": "$GIT_SHA", "release-name": "$RELEASE_NAME"}
EOF

# ensure our 'awssum' smart package is up-to-date
cd $METEOR_DIR
git submodule init
git submodule update

# publish-release is a meteor app
cd $DIR/publish-release

# run it
#
# XXX when we support third-party packages use that mechanism instead
# of keeping the package in git.
#
# XXX it would be cool to be able to not listen on any port here. instead
# we use port 31337
$METEOR_DIR/meteor -p 31337 --once --settings=$PUBLISH_TMPDIR/settings.json

