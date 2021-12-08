#!/usr/bin/env bash

set -e
set -u

source "$(dirname $0)/build-dev-bundle-common.sh"
echo CHECKOUT DIR IS "$CHECKOUT_DIR"
echo BUILDING NODE "v$NODE_VERSION" IN "$DIR"

cd "$DIR"

if [ ! -z ${NODE_FROM_SRC+x} ] || [ ! -z ${NODE_COMMIT_HASH+x} ]
then
    if [ ! -z ${NODE_COMMIT_HASH+x} ]
    then
        NODE_FROM_SRC=${NODE_FROM_SRC:=true}
        echo "Building Node source from Git hash ${NODE_COMMIT_HASH}...";
        NODE_URL="https://github.com/meteor/node/archive/${NODE_COMMIT_HASH}.tar.gz"
    else
        echo "Building Node source from ${NODE_VERSION} src tarball...";
        NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}.tar.gz"
    fi
else
    NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TGZ}"
fi

mkdir node-build
cd node-build

echo "Downloading Node from ${NODE_URL}"
curl -sL "${NODE_URL}" | tar zx --strip-components 1

node_configure_flags=(
    # Enable the ICU internationalization library.
    '--download=icu'
)

if [ "${NODE_FROM_SRC:-}" = "debug" ]
then
    node_configure_flags+=('--debug')
fi

# "make binary" includes DESTDIR and PORTABLE=1 options.
# Unsetting BUILD_DOWNLOAD_FLAGS allows the ICU download above to work.
make -j4 binary \
  BUILD_DOWNLOAD_FLAGS= \
  RELEASE_URLBASE=https://nodejs.org/download/release/ \
  CONFIG_FLAGS="${node_configure_flags[@]+"${node_configure_flags[@]}"}"

TARBALL_PATH="${CHECKOUT_DIR}/node_${PLATFORM}_v${NODE_VERSION}.tar.gz"
mv node-*.tar.gz "${TARBALL_PATH}"

cd "$DIR"
rm -rf node-build

echo DONE
