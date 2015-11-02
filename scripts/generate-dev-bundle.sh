#!/usr/bin/env bash

set -e
set -u

# Read the bundle version from the meteor shell script.
BUNDLE_VERSION=$(perl -ne 'print $1 if /BUNDLE_VERSION=(\S+)/' meteor)
if [ -z "$BUNDLE_VERSION" ]; then
    echo "BUNDLE_VERSION not found"
    exit 1
fi

source "$(dirname $0)/build-dev-bundle-common.sh"
echo CHECKOUT DIR IS "$CHECKOUT_DIR"
echo BUILDING DEV BUNDLE "$BUNDLE_VERSION" IN "$DIR"

cd "$DIR"

S3_HOST="s3.amazonaws.com/com.meteor.jenkins"

# Update these values after building the dev-bundle-node Jenkins project.
# Also make sure to update NODE_VERSION in generate-dev-bundle.ps1.
NODE_VERSION=0.10.40
NODE_BUILD_NUMBER=18
NODE_TGZ="node_${PLATFORM}_v${NODE_VERSION}.tar.gz"
if [ -f "${CHECKOUT_DIR}/${NODE_TGZ}" ] ; then
    tar zxf "${CHECKOUT_DIR}/${NODE_TGZ}"
else
    NODE_URL="https://${S3_HOST}/dev-bundle-node-${NODE_BUILD_NUMBER}/${NODE_TGZ}"
    echo "Downloading Node from ${NODE_URL}"
    curl "${NODE_URL}" | tar zx
fi

# Update these values after building the dev-bundle-mongo Jenkins project.
# Also make sure to update MONGO_VERSION in generate-dev-bundle.ps1.
MONGO_VERSION=2.6.7
MONGO_BUILD_NUMBER=6
MONGO_TGZ="mongo_${PLATFORM}_v${MONGO_VERSION}.tar.gz"
if [ -f "${CHECKOUT_DIR}/${MONGO_TGZ}" ] ; then
    tar zxf "${CHECKOUT_DIR}/${MONGO_TGZ}"
else
    MONGO_URL="https://${S3_HOST}/dev-bundle-mongo-${MONGO_BUILD_NUMBER}/${MONGO_TGZ}"
    echo "Downloading Mongo from ${MONGO_URL}"
    curl "${MONGO_URL}" | tar zx
fi

# Copy bundled npm to temporary directory so we can restore it later
# We do this because the bundled node is built using PORTABLE=1,
# which makes npm look for node relative to it's own directory
# See build-node-for-dev-bundle.sh
cp -R "$DIR/lib/node_modules/npm" "$DIR/bundled-npm"

# export path so we use the downloaded node and npm
export PATH="$DIR/bin:$PATH"

# install npm 3 in a temporary directory
mkdir "$DIR/bin/npm3"
cd "$DIR/bin/npm3"
npm install npm@3.1.2
cp node_modules/npm/bin/npm .

# export path again with our temporary npm3 directory first,
# so we can use npm 3 during builds
export PATH="$DIR/bin/npm3:$PATH"

which node
which npm

# When adding new node modules (or any software) to the dev bundle,
# remember to update LICENSE.txt! Also note that we include all the
# packages that these depend on, so watch out for new dependencies when
# you update version numbers.

# First, we install the modules that are dependencies of tools/server/boot.js:
# the modules that users of 'meteor bundle' will also have to install. We save a
# shrinkwrap file with it, too.  We do this in a separate place from
# $DIR/server-lib/node_modules originally, because otherwise 'npm shrinkwrap'
# will get confused by the pre-existing modules.
mkdir "${DIR}/build/npm-server-install"
cd "${DIR}/build/npm-server-install"
node "${CHECKOUT_DIR}/scripts/dev-bundle-server-package.js" >package.json
npm install
npm shrinkwrap

mkdir -p "${DIR}/server-lib/node_modules"
# This ignores the stuff in node_modules/.bin, but that's OK.
cp -R node_modules/* "${DIR}/server-lib/node_modules/"

mv package.json npm-shrinkwrap.json "${DIR}/etc/"

# Fibers ships with compiled versions of its C code for a dozen platforms. This
# bloats our dev bundle. Remove all the ones other than our
# architecture. (Expression based on build.js in fibers source.)
shrink_fibers () {
    FIBERS_ARCH=$(node -p -e 'process.platform + "-" + process.arch + "-v8-" + /[0-9]+\.[0-9]+/.exec(process.versions.v8)[0]')
    mv $FIBERS_ARCH ..
    rm -rf *
    mv ../$FIBERS_ARCH .
}

cd "$DIR/server-lib/node_modules/fibers/bin"
shrink_fibers

# Now, install the npm modules which are the dependencies of the command-line
# tool.
mkdir "${DIR}/build/npm-tool-install"
cd "${DIR}/build/npm-tool-install"
node "${CHECKOUT_DIR}/scripts/dev-bundle-tool-package.js" >package.json
npm install
cp -R node_modules/* "${DIR}/lib/node_modules/"

cd "${DIR}/lib"

# Clean up some bulky stuff.
cd node_modules

# Used to delete bulky subtrees. It's an error (unlike with rm -rf) if they
# don't exist, because that might mean it moved somewhere else and we should
# update the delete line.
delete () {
    if [ ! -e "$1" ]; then
        echo "Missing (moved?): $1"
        exit 1
    fi
    rm -rf "$1"
}

delete browserstack-webdriver/docs
delete browserstack-webdriver/lib/test

delete sqlite3/deps
delete wordwrap/test
delete moment/min

# Remove esprima tests to reduce the size of the dev bundle
find . -path '*/esprima-fb/test' | xargs rm -rf

cd "$DIR/lib/node_modules/fibers/bin"
shrink_fibers

# Download BrowserStackLocal binary.
BROWSER_STACK_LOCAL_URL="https://browserstack-binaries.s3.amazonaws.com/BrowserStackLocal-07-03-14-$OS-$ARCH.gz"

cd "$DIR/build"
curl -O $BROWSER_STACK_LOCAL_URL
gunzip BrowserStackLocal*
mv BrowserStackLocal* BrowserStackLocal
mv BrowserStackLocal "$DIR/bin/"

# remove our temporary npm3 directory
rm -rf "$DIR/bin/npm3"

# Sanity check to see if we're not breaking anything by replacing npm
INSTALLED_NPM_VERSION=$(cat "$DIR/lib/node_modules/npm/package.json" |
xargs -0 node -e "console.log(JSON.parse(process.argv[1]).version)")
if [ "$INSTALLED_NPM_VERSION" != "1.4.28" ]; then
  echo "Unexpected NPM version in lib/node_modules: $INSTALLED_NPM_VERSION"
  echo "We will be replacing it with our own version because the bundled node"
  echo "is built using PORTABLE=1, which makes npm look for node relative to"
  echo "its own directory."
  echo "Update this check if you know what you're doing."
  exit 1
fi

# Overwrite lib/modules/npm with bundled npm from temporary directory
rm -rf "$DIR/lib/node_modules/npm"
mv -f "$DIR/bundled-npm" "$DIR/lib/node_modules/npm"

echo BUNDLING

cd "$DIR"
echo "${BUNDLE_VERSION}" > .bundle_version.txt
rm -rf build

tar czf "${CHECKOUT_DIR}/dev_bundle_${PLATFORM}_${BUNDLE_VERSION}.tar.gz" .

echo DONE
