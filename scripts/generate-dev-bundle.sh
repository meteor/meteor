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

extractNodeFromTarGz() {
    LOCAL_TGZ="${CHECKOUT_DIR}/node_${PLATFORM}_v${NODE_VERSION}.tar.gz"
    if [ -f "$LOCAL_TGZ" ]
    then
        echo "Skipping download and installing Node from $LOCAL_TGZ" >&2
        tar zxf "$LOCAL_TGZ"
        return 0
    fi
    return 1
}

downloadNodeFromS3() {
    test -n "${NODE_BUILD_NUMBER}" || return 1
    S3_HOST="s3.amazonaws.com/com.meteor.jenkins"
    S3_TGZ="node_${UNAME}_${ARCH}_v${NODE_VERSION}.tar.gz"
    NODE_URL="https://${S3_HOST}/dev-bundle-node-${NODE_BUILD_NUMBER}/${S3_TGZ}"
    echo "Downloading Node from ${NODE_URL}" >&2
    curl "${NODE_URL}" | tar zx --strip-components 1
}

downloadOfficialNode() {
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TGZ}"
    echo "Downloading Node from ${NODE_URL}" >&2
    curl "${NODE_URL}" | tar zx --strip-components 1
}

downloadReleaseCandidateNode() {
    NODE_URL="https://nodejs.org/download/rc/v${NODE_VERSION}/${NODE_TGZ}"
    echo "Downloading Node from ${NODE_URL}" >&2
    curl "${NODE_URL}" | tar zx --strip-components 1
}

# Try each strategy in the following order:
extractNodeFromTarGz || downloadNodeFromS3 || \
  downloadOfficialNode || downloadReleaseCandidateNode

# Download Mongo from mongodb.com. Will download a 64-bit version of Mongo
# by default. Will download a 32-bit version of Mongo if using a 32-bit based
# OS.
MONGO_VERSION=$MONGO_VERSION_64BIT
MONGO_SSL="-ssl"

# The MongoDB "Generic" Linux option is not offered with SSL, which is reserved
# for named distributions.  This works out better since the SSL support adds
# size to the dev bundle though isn't necessary for local development.
if [ $UNAME = "Linux" ]; then
  MONGO_SSL=""
fi

if [ $ARCH = "i686" ]; then
  MONGO_VERSION=$MONGO_VERSION_32BIT
fi

MONGO_NAME="mongodb-${OS}-${ARCH}-${MONGO_VERSION}"
MONGO_NAME_SSL="mongodb-${OS}${MONGO_SSL}-${ARCH}-${MONGO_VERSION}"
MONGO_TGZ="${MONGO_NAME_SSL}.tgz"
MONGO_URL="http://fastdl.mongodb.org/${OS}/${MONGO_TGZ}"
echo "Downloading Mongo from ${MONGO_URL}"
curl "${MONGO_URL}" | tar zx

# Put Mongo binaries in the right spot (mongodb/bin)
mkdir -p "mongodb/bin"
mv "${MONGO_NAME}/bin/mongod" "mongodb/bin"
mv "${MONGO_NAME}/bin/mongo" "mongodb/bin"
rm -rf "${MONGO_NAME}"

# export path so we use the downloaded node and npm
export PATH="$DIR/bin:$PATH"

cd "$DIR/lib"
# Overwrite the bundled version with the latest version of npm.
npm install "npm@$NPM_VERSION"

which node
which npm
npm version

# Make node-gyp use Node headers and libraries from $DIR/include/node.
export HOME="$DIR"
export USERPROFILE="$DIR"
export npm_config_nodedir="$DIR"

INCLUDE_PATH="${DIR}/include/node"
echo "Contents of ${INCLUDE_PATH}:"
ls -al "$INCLUDE_PATH"

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
node "${CHECKOUT_DIR}/scripts/dev-bundle-server-package.js" > package.json
npm install
npm shrinkwrap

mkdir -p "${DIR}/server-lib/node_modules"
# This ignores the stuff in node_modules/.bin, but that's OK.
cp -R node_modules/* "${DIR}/server-lib/node_modules/"

mkdir -p "${DIR}/etc"
mv package.json npm-shrinkwrap.json "${DIR}/etc/"

# Fibers ships with compiled versions of its C code for a dozen platforms. This
# bloats our dev bundle. Remove all the ones other than our
# architecture. (Expression based on build.js in fibers source.)
shrink_fibers () {
    FIBERS_ARCH=$(node -p -e 'process.platform + "-" + process.arch + "-" + process.versions.modules')
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
# Also include node_modules/.bin, so that `meteor npm` can make use of
# commands like node-gyp and node-pre-gyp.
cp -R node_modules/.bin "${DIR}/lib/node_modules/"

cd "${DIR}/lib"

cd node_modules

# @babel/runtime@7.0.0-beta.56 removed the @babel/runtime/helpers/builtin
# directory, since all helpers are now implemented in the built-in style
# (meaning they do not import core-js polyfills). Generated code in build
# plugins might still refer to the old directory layout (at least for the
# time being), but we can accommodate that by symlinking to the parent
# directory, since all the module names are the same.
if [ -d @babel/runtime/helpers ] &&
   [ ! -d @babel/runtime/helpers/builtin ]
then
    pushd @babel/runtime/helpers
    ln -s . builtin
    popd
fi

## Clean up some bulky stuff.

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

# Since we install a patched version of pacote in $DIR/lib/node_modules,
# we need to remove npm's bundled version to make it use the new one.
if [ -d "pacote" ]
then
    delete npm/node_modules/pacote
fi

delete sqlite3/deps
delete sqlite3/node_modules/node-pre-gyp
delete wordwrap/test
delete moment/min

# Remove esprima tests to reduce the size of the dev bundle
find . -path '*/esprima-fb/test' | xargs rm -rf

cd "$DIR/lib/node_modules/fibers/bin"
shrink_fibers

# Sanity check to see if we're not breaking anything by replacing npm
INSTALLED_NPM_VERSION=$(cat "$DIR/lib/node_modules/npm/package.json" |
xargs -0 node -e "console.log(JSON.parse(process.argv[1]).version)")
if [ "$INSTALLED_NPM_VERSION" != "$NPM_VERSION" ]; then
  echo "Unexpected NPM version in lib/node_modules: $INSTALLED_NPM_VERSION"
  echo "Update this check if you know what you're doing."
  exit 1
fi

echo BUNDLING

cd "$DIR"
echo "${BUNDLE_VERSION}" > .bundle_version.txt
rm -rf build CHANGELOG.md ChangeLog LICENSE README.md .npm

tar czf "${CHECKOUT_DIR}/dev_bundle_${PLATFORM}_${BUNDLE_VERSION}.tar.gz" .

echo DONE
