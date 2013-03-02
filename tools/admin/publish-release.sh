#!/bin/bash
DIR="$(pwd)"
METEOR_DIR="$(pwd)/../.."

# prepare settings file with git sha of last commit
TMPDIR=$(mktemp -d -t meteor-publish-release-XXXXXXXX)
GIT_SHA=$(git rev-parse HEAD)
cat > "$TMPDIR/settings.json" <<EOF
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
# XXX when we support packages in apps fold this into the app itself.
#
# XXX when we support third-party packages use that mechanism instead
# of keeping the package in git.
#
# XXX it would be cool to be able to not listen on any port here. instead
# we use port 31337
PACKAGE_DIRS=$DIR/publish-release-packages $METEOR_DIR/meteor -p 31337 --once --settings=$TMPDIR/settings.json

