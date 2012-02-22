#!/bin/bash

set -e

BUNDLE_VERSION=0.0.9
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
mkdir build
cd build

git clone git://github.com/joyent/node.git
cd node
git checkout v0.6.11


# on linux, build a static openssl to link against. Everything else we
# dynamically link against is pretty stable.
#
# This is pretty hacky, but there doesn't seem to be any other way to do
# this in the node 0.6 build system. The build system is all different
# in 0.7, so this will have to change when we upgrade
if [ "$UNAME" == "Linux" ] ; then
    curl http://www.openssl.org/source/openssl-1.0.0g.tar.gz | tar -xz
    cd openssl-1.0.0g
    ./config --prefix="$DIR/build/openssl-out" no-shared
    make install
    NODE_CONFIG_FLAGS=(
        "--openssl-includes=$DIR/build/openssl-out/include"
        "--openssl-libpath=$DIR/build/openssl-out/lib" )
    cd "$DIR/build/node"
    patch -p1 <<EOF
diff --git a/wscript b/wscript
index 2b04358..4f82be3 100644
--- a/wscript
+++ b/wscript
@@ -348,20 +348,10 @@ def configure(conf):
       if sys.platform.startswith('win32'):
         openssl_lib_names += ['ws2_32', 'gdi32']
 
-      libssl = conf.check_cc(lib=openssl_lib_names,
-                             header_name='openssl/ssl.h',
-                             function_name='SSL_library_init',
-                             includes=openssl_includes,
-                             libpath=openssl_libpath,
-                             uselib_store='OPENSSL')
-
-      libcrypto = conf.check_cc(lib='crypto',
-                                header_name='openssl/crypto.h',
-                                includes=openssl_includes,
-                                libpath=openssl_libpath,
-                                uselib_store='OPENSSL')
-
-      if libcrypto and libssl:
+      # XXX Horrible hack for static openssl!
+      conf.env.append_value("LINKFLAGS", ["-Wl,-Bstatic","-lssl","-lcrypto"])
+
+      if True:
         conf.env["USE_OPENSSL"] = Options.options.use_openssl = True
         conf.env.append_value("CPPFLAGS", "-DHAVE_OPENSSL=1")
       elif sys.platform.startswith('win32'):
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
npm install connect@1.8.5
npm install connect-gzip@0.1.5
npm install optimist@0.3.1
npm install coffee-script@1.2.0
npm install less@1.2.1
npm install mime@1.2.4
npm install semver@1.0.13
npm install handlebars@1.0.2beta
npm install mongodb@0.9.7-1.4
npm install uglify-js@1.2.5
npm install clean-css@0.3.2
npm install progress@0.0.4
npm install fibers@0.6.4
npm install useragent@1.0.5
npm install request@2.9.3
npm install http-proxy@0.8.0
npm install sockjs@0.2.1

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


## Install socket.io. Even though we're not using it any more, we still
## want it in the dev bundle so that older apps already deployed to
## mother can still run.
cd "$DIR/lib/node_modules"
npm install socket.io@0.8.7
# Remove annoying print from socket.io that can't be disabled in config.
cd "$DIR"
patch -p2 <<EOF
diff --git a/dev_bundle/lib/node_modules/socket.io/lib/manager.js b/dev_bundle/lib/node_modules/socket.io/lib/manager.js
index ee2bf49..a68f9cb 100644
--- a/dev_bundle/lib/node_modules/socket.io/lib/manager.js
+++ b/dev_bundle/lib/node_modules/socket.io/lib/manager.js
@@ -114,7 +114,7 @@ function Manager (server, options) {
     }
   }
 
-  this.log.info('socket.io started');
+  // this.log.info('socket.io started'); // XXX meteor disabled
 };
 
 Manager.prototype.__proto__ = EventEmitter.prototype
EOF
# Patch an issue already fixed in socket.io master, but not released yet.
# https://github.com/LearnBoost/socket.io-client/commit/7155d84af997dcfca418568dfcc778263926d7b2
cd "$DIR/lib/node_modules/socket.io/node_modules/socket.io-client"
patch -p1 <<EOF
diff --git a/lib/socket.js b/lib/socket.js
index 0f1b1c7..932beaa 100644
--- a/lib/socket.js
+++ b/lib/socket.js
@@ -405,7 +405,7 @@
   Socket.prototype.onError = function (err) {
     if (err && err.advice) {
-      if (err.advice === 'reconnect' && this.connected) {
+      if (this.options.reconnect && err.advice === 'reconnect' && this.connected) {
         this.disconnect();
         this.reconnect();
       }
EOF
# rebuild
make build


echo BUNDLING

cd "$DIR"
echo "${BUNDLE_VERSION}" > .bundle_version.txt
rm -rf build

tar czf "${TARGET_DIR}/dev_bundle_${UNAME}_${ARCH}_${BUNDLE_VERSION}.tar.gz" .

echo DONE
