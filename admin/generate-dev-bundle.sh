#!/bin/bash

set -e

BUNDLE_VERSION=0.1.4
UNAME=$(uname)
ARCH=$(uname -m)

if [ "$UNAME" == "Linux" ] ; then
    if [ "$ARCH" != "i686" -a "$ARCH" != "x86_64" ] ; then
        echo "Unsupported architecture: $ARCH"
        echo "Meteor only supports i686 and x86_64 for now."
        exit 1
    fi
    MONGO_NAME="mongodb-linux-${ARCH}-2.0.2"
    MONGO_URL="http://fastdl.mongodb.org/linux/${MONGO_NAME}.tgz"
elif [ "$UNAME" == "Darwin" ] ; then
    SYSCTL_64BIT=$(sysctl -n hw.cpu64bit_capable 2>/dev/null || echo 0)
    if [ "$ARCH" == "i386" -a "1" != "$SYSCTL_64BIT" ] ; then
        # some older macos returns i386 but can run 64 bit binaries.
        # Probably should distribute binaries built on these machines,
        # but it should be OK for users to run.
        ARCH="x86_64"
    fi

    if [ "$ARCH" != "x86_64" ] ; then
        echo "Unsupported architecture: $ARCH"
        echo "Meteor only supports x86_64 for now."
        exit 1
    fi

    MONGO_NAME="mongodb-osx-${ARCH}-2.0.2"
    MONGO_URL="http://fastdl.mongodb.org/osx/${MONGO_NAME}.tgz"
else
    echo "This OS not yet supported"
    exit 1
fi


# save off meteor checkout dir as final target
cd `dirname $0`/..
TARGET_DIR=`pwd`

DIR=`mktemp -d -t generate-dev-bundle-XXXXXXXX`
trap 'rm -rf "$DIR" >/dev/null 2>&1' 0

echo BUILDING IN "$DIR"

cd "$DIR"
chmod 755 .
umask 022
mkdir build
cd build

git clone git://github.com/joyent/node.git
cd node
git checkout v0.6.15

# use newer v8. This fixes an issue with node-fibers:
# https://github.com/laverdet/node-fibers/issues/28
echo checking out v8
rm -rf deps/v8
git clone http://github.com/v8/v8.git deps/v8
(cd deps/v8 && git checkout 3.9.24)

# use newer npm. workaround issue in fstream-npm?
echo checking out npm
rm -rf deps/npm
git clone http://github.com/isaacs/npm.git deps/npm
(cd deps/npm && git checkout v1.1.18)


# on linux, build a static openssl to link against. Everything else we
# dynamically link against is pretty stable.
#
# This is pretty hacky, but there doesn't seem to be any other way to do
# this in the node 0.6 build system. The build system is all different
# in 0.7, so this will have to change when we upgrade
if [ "$UNAME" == "Linux" ] ; then
    curl http://www.openssl.org/source/openssl-1.0.0i.tar.gz | tar -xz
    cd openssl-1.0.0i
    ./config --prefix="$DIR/build/openssl-out" no-shared
    make install
    NODE_CONFIG_FLAGS=(
        "--openssl-includes=$DIR/build/openssl-out/include"
        "--openssl-libpath=$DIR/build/openssl-out/lib" )
    cd "$DIR/build/node"
    patch -p1 <<EOF
--- a/wscript
+++ b/wscript
@@ -348,17 +348,23 @@ def configure(conf):
       if sys.platform.startswith('win32'):
         openssl_lib_names += ['ws2_32', 'gdi32']
 
+      # XXX METEOR Horrible hack for static openssl!
+      static_linkflags = ["-Wl,-Bstatic","-lssl","-lcrypto"]
+      openssl_lib_names += ['dl']
+
       libssl = conf.check_cc(lib=openssl_lib_names,
                              header_name='openssl/ssl.h',
                              function_name='SSL_library_init',
                              includes=openssl_includes,
                              libpath=openssl_libpath,
+                             linkflags=static_linkflags,
                              uselib_store='OPENSSL')
 
       libcrypto = conf.check_cc(lib='crypto',
                                 header_name='openssl/crypto.h',
                                 includes=openssl_includes,
                                 libpath=openssl_libpath,
+                                linkflags=static_linkflags,
                                 uselib_store='OPENSSL')
 
       if libcrypto and libssl:
EOF

fi


export JOBS=4
./configure --prefix="$DIR" ${NODE_CONFIG_FLAGS[*]}
make
make install

# export path so we use our new node for later builds
export PATH="$DIR/bin:$PATH"

which node

which npm

cd "$DIR/lib/node_modules"
npm install connect@1.8.7 # not 2.x yet. sockjs doesn't work w/ new connect
npm install gzippo@0.1.4
npm install optimist@0.3.1
npm install coffee-script@1.3.1
npm install less@1.3.0
npm install sass@0.5.0
npm install stylus@0.25.0
npm install mime@1.2.5
npm install semver@1.0.13
npm install handlebars@1.0.5beta
npm install mongodb@0.9.9-8
npm install uglify-js@1.2.6
npm install clean-css@0.3.2
npm install progress@0.0.4
npm install fibers@0.6.5
npm install useragent@1.0.6
npm install request@2.9.202
npm install http-proxy@0.8.0

# unused, but kept in bundle for compatibility for a while.
npm install connect-gzip@0.1.5

# Sockjs has a broken optional dependancy, and npm optional dependancies
# don't seem to quite work. Fake it out with a checkout.
git clone http://github.com/akdubya/rbytes.git
npm install sockjs@0.3.1
rm -rf rbytes

# Disable mtime check in fibers. Fixes problem when packaging tools
# don't preserve mtimes.
cat > fibers/fibers.js <<EOF
// meteor removed mtime check here.

// Injects 'Fiber' and 'yield' in to global
require('./src/fibers');
EOF

cd "$DIR"
curl "$MONGO_URL" | tar -xz
mv "$MONGO_NAME" mongodb

# don't ship a number of mongo binaries. they are big and unused. these
# could be deleted from git dev_bundle but not sure which we'll end up
# needing.
cd mongodb/bin
rm bsondump mongodump mongoexport mongofiles mongoimport mongorestore mongos mongosniff mongostat mongotop
cd ../..



echo BUNDLING

cd "$DIR"
echo "${BUNDLE_VERSION}" > .bundle_version.txt
rm -rf build

tar czf "${TARGET_DIR}/dev_bundle_${UNAME}_${ARCH}_${BUNDLE_VERSION}.tar.gz" .

echo DONE
