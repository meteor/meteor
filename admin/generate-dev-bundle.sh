#!/bin/bash

set -e

BUNDLE_VERSION=0.0.4
UNAME=$(uname)

if [ "$UNAME" == "Linux" ] ; then
    MONGO_NAME="mongodb-linux-x86_64-2.0.1"
    MONGO_URL="http://fastdl.mongodb.org/linux/${MONGO_NAME}.tgz"
elif [ "$UNAME" == "Darwin" ] ; then
    MONGO_NAME="mongodb-osx-x86_64-2.0.1"
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
git checkout v0.6.5

# Disable obnoxious print. No easy way to disable that I found.
patch -p1 <<EOF
diff --git a/lib/sys.js b/lib/sys.js
index c37e2a7..d4e71bc 100644
--- a/lib/sys.js
+++ b/lib/sys.js
@@ -21,15 +21,16 @@
 
 var util = require('util');
 
-var sysWarning;
-if (!sysWarning) {
-  sysWarning = 'The "sys" module is now called "util". ' +
-               'It should have a similar interface.';
-  if (process.env.NODE_DEBUG && process.env.NODE_DEBUG.indexOf('sys') != -1)
-    console.trace(sysWarning);
-  else
-    console.error(sysWarning);
-}
+// XXX Skybreak disabled
+// var sysWarning;
+// if (!sysWarning) {
+//   sysWarning = 'The "sys" module is now called "util". ' +
+//                'It should have a similar interface.';
+//   if (process.env.NODE_DEBUG && process.env.NODE_DEBUG.indexOf('sys') != -1)
+//     console.trace(sysWarning);
+//   else
+//     console.error(sysWarning);
+// }
 
 exports.print = util.print;
 exports.puts = util.puts;
EOF

export JOBS=4
./configure --prefix="$DIR"
make
make install

# export path so we use our new node for later builds
export PATH="$DIR/bin:$PATH"

which node

which npm

cd "$DIR/lib/node_modules"
npm install connect@1.7.2
npm install connect-gzip@0.1.4
npm install optimist@0.2.6
npm install socket.io@0.8.2
npm install coffee-script@1.1.2
npm install less@1.1.5
npm install mime@1.2.2
npm install semver@1.0.9
npm install wrench@1.2.0
npm install handlebars@1.0.2beta
npm install mongodb@0.9.6-19
npm install uglify-js@1.1.1
npm install clean-css@0.2.4
npm install progress@0.0.4
npm install fibers@0.6.3
npm install useragent@1.0.3
npm install request@2.2.9

# patched versions to allow node 0.6.
# This breaks websockets!
# see https://github.com/nodejitsu/node-http-proxy/pull/152
# and https://github.com/nodejitsu/node-http-proxy/tree/0.6-compatibility
npm install 'git+https://github.com/lukasberns/node-http-proxy.git#2688d308bc'


cd "$DIR"
curl "$MONGO_URL" | tar -xz
mv "$MONGO_NAME" mongodb

# don't ship a number of mongo binaries. they are big and unused. these
# could be deleted from git dev_bundle but not sure which we'll end up
# needing.
cd mongodb/bin
rm bsondump mongodump mongoexport mongofiles mongoimport mongorestore mongos mongosniff mongostat mongotop
cd ../..


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

echo BUNDLING

cd "$DIR"
echo "${BUNDLE_VERSION}" > .bundle_version.txt
rm -rf build

tar czf "${TARGET_DIR}/dev_bundle_${UNAME}_${BUNDLE_VERSION}.tar.gz" .

echo DONE
