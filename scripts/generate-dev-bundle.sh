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
curl "http://${S3_HOST}/dev-bundle-node-${NODE_BUILD_NUMBER}/${NODE_TGZ}" | gzip -d | tar x

# Update these values after building the dev-bundle-mongo Jenkins project.
MONGO_BUILD_NUMBER=3
MONGO_VERSION=2.4.12
MONGO_TGZ="mongo_${PLATFORM}_v${MONGO_VERSION}.tar.gz"
curl "http://${S3_HOST}/dev-bundle-mongo-${MONGO_BUILD_NUMBER}/${MONGO_TGZ}" | gzip -d | tar x

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
# $DIR/lib/node_modules originally, because otherwise 'npm shrinkwrap' will get
# confused by the pre-existing modules.
#
# Some notes on upgrading modules in this file (which can't contain comments,
# sad):
#  - Fibers 1.0.2 is out but introduces a bug that's been fixed on master
#    but unreleased: https://github.com/laverdet/node-fibers/pull/189
#    We will definitely need to upgrade in order to support Node 0.12 when
#    it's out, though.
#  - Not yet upgrading Underscore from 1.5.2 to 1.7.0 (which should be done
#    in the package too) because we should consider using lodash instead
#    (and there are backwards-incompatible changes either way).
mkdir "${DIR}/build/npm-install"
cd "${DIR}/build/npm-install"
cp "${CHECKOUT_DIR}/scripts/dev-bundle-package.json" package.json
npm install
npm shrinkwrap

# This ignores the stuff in node_modules/.bin, but that's OK.
cp -R node_modules/* "${DIR}/lib/node_modules/"
mkdir "${DIR}/etc"
mv package.json npm-shrinkwrap.json "${DIR}/etc/"

# Fibers ships with compiled versions of its C code for a dozen platforms. This
# bloats our dev bundle, and confuses dpkg-buildpackage and rpmbuild into
# thinking that the packages need to depend on both 32- and 64-bit versions of
# libstd++. Remove all the ones other than our architecture. (Expression based
# on build.js in fibers source.)
# XXX We haven't used dpkg-buildpackge or rpmbuild in ages. If we remove this,
#     will it let you skip the "npm install fibers" step for running bundles?
cd "$DIR/lib/node_modules/fibers/bin"
FIBERS_ARCH=$(node -p -e 'process.platform + "-" + process.arch + "-v8-" + /[0-9]+\.[0-9]+/.exec(process.versions.v8)[0]')
mv $FIBERS_ARCH ..
rm -rf *
mv ../$FIBERS_ARCH .

# Now, install the rest of the npm modules, which are only used by the 'meteor'
# tool (and not by the bundled app boot.js script).
cd "${DIR}/lib"
npm install request@2.47.0

npm install fstream@1.0.2

npm install tar@1.0.2

npm install kexec@0.2.0

npm install source-map@0.1.40

npm install browserstack-webdriver@2.41.1
rm -rf node_modules/browserstack-webdriver/docs
rm -rf node_modules/browserstack-webdriver/lib/test

npm install node-inspector@0.7.4

# TODO(ben) Switch back to NPM once this branch is merged upstream.
pushd node_modules
git clone --branch dev_bundle --depth 1 \
    https://github.com/meteor/node-pathwatcher.git pathwatcher
pushd pathwatcher
rm -rf .git
npm install .
npm test
rm -rf node_modules/{grunt,grunt-contrib-coffee,grunt-cli,grunt-shell,grunt-atomdoc,jasmine-tagged,rimraf,node-cpplint,grunt-coffeelint,temp}
popd
popd

npm install chalk@0.5.1

npm install sqlite3@3.0.2
rm -rf node_modules/sqlite3/deps

npm install netroute@0.2.5

# Clean up a big zip file it leaves behind.
npm install phantomjs@1.9.12
rm -rf node_modules/phantomjs/tmp

npm install http-proxy@1.6.0

# XXX We ought to be able to get this from the copy in js-analyze rather than in
# the dev bundle.)
npm install esprima@1.2.2
rm -rf node_modules/esprima/test

# 2.4.0 (more or less, the package.json change isn't committed) plus our PR
# https://github.com/williamwicks/node-eachline/pull/4
npm install https://github.com/meteor/node-eachline/tarball/ff89722ff94e6b6a08652bf5f44c8fffea8a21da

# Cordova npm tool for mobile integration
# XXX We install our own fork of cordova because we need a particular patch that
# didn't land to cordova-android yet. As soon as it lands, we can switch back to
# upstream.
# https://github.com/apache/cordova-android/commit/445ddd89fb3269a772978a9860247065e5886249
#npm install cordova@3.5.0-0.2.6
npm install "https://github.com/meteor/cordova-cli/tarball/0c9b3362c33502ef8f6dba514b87279b9e440543"
rm -rf node_modules/cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules/browser-pack/node_modules/JSONStream/test/fixtures
rm -rf node_modules/cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules/browserify-zlib/node_modules/pako/benchmark
rm -rf node_modules/cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules/browserify-zlib/node_modules/pako/test
rm -rf node_modules/cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules/buffer/perf
rm -rf node_modules/cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules/crypto-browserify/test
rm -rf node_modules/cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules/derequire/node_modules/esprima-fb/test
rm -rf node_modules/cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules/derequire/node_modules/esrefactor/node_modules/esprima/test
rm -rf node_modules/cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules/insert-module-globals/node_modules/lexical-scope/node_modules/astw/node_modules/esprima-fb/test
rm -rf node_modules/cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules/module-deps/node_modules/detective/node_modules/escodegen/node_modules/esprima/test
rm -rf node_modules/cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules/module-deps/node_modules/detective/node_modules/esprima-fb/test
rm -rf node_modules/cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules/syntax-error/node_modules/esprima-fb/test
rm -rf node_modules/cordova/node_modules/cordova-lib/node_modules/cordova-js/node_modules/browserify/node_modules/umd/node_modules/ruglify/test

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
