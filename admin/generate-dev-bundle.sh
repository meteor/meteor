#!/bin/bash

set -e

BUNDLE_VERSION=0.0.5
UNAME=$(uname)

if [ "$UNAME" == "Linux" ] ; then
    MONGO_NAME="mongodb-linux-x86_64-2.0.2"
    MONGO_URL="http://fastdl.mongodb.org/linux/${MONGO_NAME}.tgz"
elif [ "$UNAME" == "Darwin" ] ; then
    MONGO_NAME="mongodb-osx-x86_64-2.0.2"
    MONGO_URL="http://fastdl.mongodb.org/osx/${MONGO_NAME}.tgz"
else
    echo "This OS not yet supported"
    exit 1
fi


# save off skybreak checkout dir as final target
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
git checkout v0.6.7

export JOBS=4
./configure --prefix="$DIR"
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
npm install socket.io@0.8.7
npm install coffee-script@1.2.0
npm install less@1.2.0
npm install mime@1.2.4
npm install semver@1.0.13
npm install wrench@1.3.3
npm install handlebars@1.0.2beta
npm install mongodb@0.9.7-1.4
npm install uglify-js@1.2.5
npm install clean-css@0.3.1
npm install progress@0.0.4
npm install fibers@0.6.4
npm install useragent@1.0.5
npm install request@2.9.3
npm install http-proxy@0.8.0


cd "$DIR"
curl "$MONGO_URL" | tar -xz
mv "$MONGO_NAME" mongodb

# don't ship a number of mongo binaries. they are big and unused. these
# could be deleted from git dev_bundle but not sure which we'll end up
# needing.
cd mongodb/bin
rm bsondump mongodump mongoexport mongofiles mongoimport mongorestore mongos mongosniff mongostat mongotop
cd ../..

# Remove annoying print from socket.io that can't be disabled in config.
patch -p2 <<EOF
diff --git a/dev_bundle/lib/node_modules/socket.io/lib/manager.js b/dev_bundle/lib/node_modules/socket.io/lib/manager.js
index ee2bf49..a68f9cb 100644
--- a/dev_bundle/lib/node_modules/socket.io/lib/manager.js
+++ b/dev_bundle/lib/node_modules/socket.io/lib/manager.js
@@ -114,7 +114,7 @@ function Manager (server, options) {
     }
   }
 
-  this.log.info('socket.io started');
+  // this.log.info('socket.io started'); // XXX skybreak disabled
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

tar czf "${TARGET_DIR}/dev_bundle_${UNAME}_${BUNDLE_VERSION}.tar.gz" .

echo DONE
