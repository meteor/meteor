#!/bin/bash

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

# ios-sim is used to run iPhone simulator from the command-line. Doesn't make
# sense to build it for linux.
if [ "$OS" == "osx" ]; then
    # the build from source is not going to work on old OS X versions, until we
    # upgrade our Mac OS X Jenkins machine, download the precompiled tarball

    # which rake # rake is required to build ios-sim
    # git clone https://github.com/phonegap/ios-sim.git
    # cd ios-sim
    # git checkout 2.0.1
    # rake build
    # which build/Release/ios-sim # check that we have in fact got the binary
    # mkdir -p "$DIR/lib/ios-sim"
    # cp -r build/Release/* "$DIR/lib/ios-sim/"

    # Download the precompiled tarball
    IOS_SIM_URL="http://android-bundle.s3.amazonaws.com/ios-sim.tgz"
    curl "$IOS_SIM_URL" | tar xfz -
    mkdir -p "$DIR/lib/ios-sim"
    cp -r ios-sim/ios-sim "$DIR/lib/ios-sim"
fi

cd "$DIR"

S3_HOST="s3.amazonaws.com/com.meteor.jenkins"

# Update these values after building the dev-bundle-node Jenkins project.
NODE_BUILD_NUMBER=8
NODE_VERSION=0.10.33
NODE_TGZ="node_${PLATFORM}_v${NODE_VERSION}.tar.gz"
if [ -f "${CHECKOUT_DIR}/${NODE_TGZ}" ] ; then
    gzip -d <"${CHECKOUT_DIR}/${NODE_TGZ}" | tar x
else
    NODE_URL="http://${S3_HOST}/dev-bundle-node-${NODE_BUILD_NUMBER}/${NODE_TGZ}"
    echo "Downloading Node from ${NODE_URL}"
    curl "${NODE_URL}" | gzip -d | tar x
fi

# Update these values after building the dev-bundle-mongo Jenkins project.
MONGO_BUILD_NUMBER=3
MONGO_VERSION=2.4.12
MONGO_TGZ="mongo_${PLATFORM}_v${MONGO_VERSION}.tar.gz"
if [ -f "${CHECKOUT_DIR}/${MONGO_TGZ}" ] ; then
    gzip -d <"${CHECKOUT_DIR}/${MONGO_TGZ}" | tar x
else
    MONGO_URL="http://${S3_HOST}/dev-bundle-mongo-${MONGO_BUILD_NUMBER}/${MONGO_TGZ}"
    echo "Downloading Mongo from ${MONGO_URL}"
    curl "${MONGO_URL}" | gzip -d | tar x
fi

cd "$DIR/build"

# export path so we use our new node for later builds
export PATH="$DIR/bin:$PATH"
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

mkdir "${DIR}/etc"
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
# Refactor node modules to top level and remove unnecessary duplicates.
npm dedupe
cp -R node_modules/* "${DIR}/lib/node_modules/"

cd "${DIR}/lib"

# TODO Move this into dev-bundle-tool-package.js when it can be safely
# installed that way (i.e. without build nan/runas build errors).
npm install pathwatcher@2.3.5

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

# dedupe isn't good enough to eliminate 3 copies of esprima, sigh.
find . -path '*/esprima/test' | xargs rm -rf
find . -path '*/esprima-fb/test' | xargs rm -rf

# dedupe isn't good enough to eliminate 4 copies of JSONstream, sigh.
find . -path '*/JSONStream/test/fixtures' | xargs rm -rf

# Not sure why dedupe doesn't lift these to the top.
pushd cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules
delete browserify-zlib/node_modules/pako/benchmark
delete browserify-zlib/node_modules/pako/test
delete buffer/perf
delete crypto-browserify/test
delete umd/node_modules/ruglify/test
popd

cd "$DIR/lib/node_modules/fibers/bin"
shrink_fibers

# Download BrowserStackLocal binary.
BROWSER_STACK_LOCAL_URL="http://browserstack-binaries.s3.amazonaws.com/BrowserStackLocal-07-03-14-$OS-$ARCH.gz"

cd "$DIR/build"
curl -O $BROWSER_STACK_LOCAL_URL
gunzip BrowserStackLocal*
mv BrowserStackLocal* BrowserStackLocal
mv BrowserStackLocal "$DIR/bin/"

echo BUNDLING

cd "$DIR"
echo "${BUNDLE_VERSION}" > .bundle_version.txt
rm -rf build

tar czf "${CHECKOUT_DIR}/dev_bundle_${PLATFORM}_${BUNDLE_VERSION}.tar.gz" .

echo DONE
