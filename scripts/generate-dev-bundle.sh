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

if [ ! -z ${NODE_FROM_SRC+x} ] || [ ! -z ${NODE_COMMIT_HASH+x} ]; then
  if [ ! -z ${NODE_COMMIT_HASH+x} ]; then
    ${NODE_FROM_SRC:=true}
    echo "Building Node source from Git hash ${NODE_COMMIT_HASH}...";
    NODE_URL="https://github.com/meteor/node/archive/${NODE_COMMIT_HASH}.tar.gz"
  else
    echo "Building Node source from ${NODE_VERSION} src tarball...";
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}.tar.gz"
  fi
else
  NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TGZ}"
fi

# Update these values after building the dev-bundle-node Jenkins project.
# Also make sure to update NODE_VERSION in generate-dev-bundle.ps1.
function downloadNode {
  echo "Downloading Node from ${NODE_URL}"
  curl -sL "${NODE_URL}" | tar zx --strip-components 1
}

if [ ! -z ${NODE_FROM_SRC+x} ]; then
  mkdir node-src/ && cd node-src/
  downloadNode
  if [ "${NODE_FROM_SRC:-}" = "debug" ]; then
    ./configure --debug --prefix "${DIR}" 2>&1 > /dev/null
  else
    ./configure --prefix "${DIR}" 2>&1 > /dev/null
  fi
  make -j4 2>&1 > /dev/null
  make install 2>&1 > /dev/null
  export npm_config_nodedir="${DIR}/node-src"
  cd "$DIR"
else
  downloadNode
fi

# Download Mongo from mongodb.com
MONGO_NAME="mongodb-${OS}-${ARCH}-${MONGO_VERSION}"
MONGO_TGZ="${MONGO_NAME}.tgz"
MONGO_URL="http://fastdl.mongodb.org/${OS}/${MONGO_TGZ}"
echo "Downloading Mongo from ${MONGO_URL}"
curl "${MONGO_URL}" | tar zx

# Put Mongo binaries in the right spot (mongodb/bin)
mkdir -p mongodb/bin
mv "${MONGO_NAME}/bin/mongod" mongodb/bin
mv "${MONGO_NAME}/bin/mongo" mongodb/bin
rm -rf "${MONGO_NAME}"

# export path so we use the downloaded node and npm
export PATH="$DIR/bin:$PATH"

cd "$DIR/lib"
# Overwrite the bundled version with the latest version of npm.
npm install "npm@$NPM_VERSION"

which node
which npm
npm version

# When adding new node modules (or any software) to the dev bundle,
# remember to update LICENSE.txt! Also note that we include all the
# packages that these depend on, so watch out for new dependencies when
# you update version numbers.

function npmInstall {
  if [ "${NODE_FROM_SRC:-}" = "debug" ]; then
    npm install --debug
  else
    npm install
  fi
}

# First, we install the modules that are dependencies of tools/server/boot.js:
# the modules that users of 'meteor bundle' will also have to install. We save a
# shrinkwrap file with it, too.  We do this in a separate place from
# $DIR/server-lib/node_modules originally, because otherwise 'npm shrinkwrap'
# will get confused by the pre-existing modules.
mkdir "${DIR}/build/npm-server-install"
cd "${DIR}/build/npm-server-install"
node "${CHECKOUT_DIR}/scripts/dev-bundle-server-package.js" > package.json
npmInstall
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
npmInstall
cp -R node_modules/* "${DIR}/lib/node_modules/"
# Also include node_modules/.bin, so that `meteor npm` can make use of
# commands like node-gyp and node-pre-gyp.
cp -R node_modules/.bin "${DIR}/lib/node_modules/"

if [ -z ${NODE_FROM_SRC+x} ]; then
  # Make node-gyp install Node headers and libraries in $DIR/.node-gyp/.
  # https://github.com/nodejs/node-gyp/blob/4ee31329e0/lib/node-gyp.js#L52
  export HOME="$DIR"
  export USERPROFILE="$DIR"
  node "${DIR}/lib/node_modules/node-gyp/bin/node-gyp.js" install
  INCLUDE_PATH="${DIR}/.node-gyp/${NODE_VERSION}/include/node"
  echo "Contents of ${INCLUDE_PATH}:"
  ls -al "$INCLUDE_PATH"
else
  echo "Skipping node-gyp headers because we're building from source."
fi

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

delete npm/test
delete npm/node_modules/node-gyp
pushd npm/node_modules
ln -s ../../node-gyp ./
popd

delete sqlite3/deps
delete sqlite3/node_modules/nan
delete sqlite3/node_modules/node-pre-gyp
delete wordwrap/test
delete moment/min

# Remove esprima tests to reduce the size of the dev bundle
find . -path '*/esprima-fb/test' | xargs rm -rf

cd "$DIR/lib/node_modules/fibers/bin"
shrink_fibers

if [ "${NODE_FROM_SRC:-}" = "debug" ]; then
  # Hack for modules which explicitly `require()` the "Release" binding path.
  sed -i -e 's|build/Release/|build/Debug/|g' \
    $DIR/lib/node_modules/pathwatcher/lib/main.js \
    $DIR/lib/node_modules/runas/lib/runas.js \
    $DIR/lib/node_modules/kexec/index.js
fi

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
delete node-src/
echo "${BUNDLE_VERSION}" > .bundle_version.txt
rm -rf build CHANGELOG.md ChangeLog LICENSE README.md

tar czf "${CHECKOUT_DIR}/dev_bundle_${PLATFORM}_${BUNDLE_VERSION}.tar.gz" .

echo DONE
