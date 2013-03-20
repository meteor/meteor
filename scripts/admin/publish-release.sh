#!/bin/bash
cd `dirname $0`
DIR="$(pwd)"
METEOR_DIR="$(pwd)/../.."

# prepare settings file with git sha of last commit
PUBLISH_TMPDIR=$(mktemp -d -t meteor-publish-release-XXXXXXXX)
GIT_SHA=$(git rev-parse HEAD)
cat > "$PUBLISH_TMPDIR/settings.json" <<EOF
{"git-sha": "$GIT_SHA"}
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

