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

# Update these values after building the dev-bundle-node Jenkins project.
# Also make sure to update NODE_VERSION in generate-dev-bundle.ps1.
function downloadNode {
    echo "Downloading Node from ${NODE_URL}"
    curl -sL "${NODE_URL}" | tar zx --strip-components 1
}

if [ ! -z ${NODE_FROM_SRC+x} ]
then
    mkdir node-build && cd node-build
    downloadNode

    # Build with International Components for Unicode (ICU) Support...
    # Node 4.x used 56.x. Node 8.x uses 59.x.   I believe the only
    # reliable location to find the correct version of ICU for a Node.js
    # release is to check `process.config.icu_ver_major` from an
    # official, compiled Node.js release.
    # https://github.com/nodejs/node/wiki/Intl#configure-node-with-specific-icu-source
    echo "Downloading International Components for Unicode (ICU)..."
    curl -sL http://download.icu-project.org/files/icu4c/56.1/icu4c-56_1-src.tgz | \
      tar zx -C deps/

    node_configure_flags=(\
      '--prefix=/' \
      '--with-intl=small-icu' \
      '--release-urlbase=https://nodejs.org/download/release/' \
    )

    if [ "${NODE_FROM_SRC:-}" = "debug" ]
    then
        node_configure_flags+=('--debug')
    fi

    ./configure "${node_configure_flags[@]}"
    make -j4
    # PORTABLE=1 is a node hack to make npm look relative to itself instead
    # of hard coding the PREFIX.
    # DESTDIR installs to the requested location, without using PREFIX.
    # See tools/install.py in the Node source for more information.
    make install PORTABLE=1 DESTDIR="${DIR}"
    cd "$DIR"
else
    downloadNode
fi

cd "$DIR"
stripBinary bin/node

# export path so we use our new node for later builds
PATH="$DIR/bin:$PATH"
which node
which npm
npm version

echo BUNDLING

cd "$DIR"
rm -rf node-build
tar czvf "${CHECKOUT_DIR}/node_${PLATFORM}_v${NODE_VERSION}.tar.gz" .

echo DONE
