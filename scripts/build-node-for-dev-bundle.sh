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
    mkdir node-src/ && cd node-src/
    downloadNode
    if [ "${NODE_FROM_SRC:-}" = "debug" ]
    then
        ./configure --debug --prefix "${DIR}"
    else
        ./configure --prefix "${DIR}"
    fi
    make -j4
    # PORTABLE=1 is a node hack to make npm look relative to itself instead
    # of hard coding the PREFIX.
    make install PORTABLE=1
    export npm_config_nodedir="${DIR}/node-src"
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
rm -rf build
tar czvf "${CHECKOUT_DIR}/node_${PLATFORM}_v${NODE_VERSION}.tar.gz" .

echo DONE
