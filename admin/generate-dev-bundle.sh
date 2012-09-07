#!/bin/bash

set -e

BUNDLE_VERSION=0.2.2
UNAME=$(uname)
ARCH=$(uname -m)

if [ "$UNAME" == "Linux" ] ; then
    if [ "$ARCH" != "i686" -a "$ARCH" != "x86_64" ] ; then
        echo "Unsupported architecture: $ARCH"
        echo "Meteor only supports i686 and x86_64 for now."
        exit 1
    fi
    MONGO_NAME="mongodb-linux-${ARCH}-2.2.0"
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

    MONGO_NAME="mongodb-osx-${ARCH}-2.2.0"
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
git checkout v0.8.8

# Patch node to allow unsetting O_NONBLOCK on TTYs. This is a gross hack
# to work around node setting process.stdin to be non-blocking.
#
# This is needed to allow spawning a mongo command-line process to the
# user's terminal (eg 'meteor mongo'). It also fixes behavior in
# emacs-shell mode.
#
# Related github issue:
# https://github.com/joyent/node/issues/3584
# Discussion of implementing process.stdout.setBlocking(bool):
# http://piscisaureus.no.de/libuv/2012-06-29#00:40:38.256
# Emacs bug this works around:
# http://debbugs.gnu.org/cgi/bugreport.cgi?bug=2602
patch -p1 <<EOF
diff --git a/src/tty_wrap.cc b/src/tty_wrap.cc
index fde8717..62cf939 100644
--- a/src/tty_wrap.cc
+++ b/src/tty_wrap.cc
@@ -26,6 +26,8 @@
 #include "stream_wrap.h"
 #include "tty_wrap.h"
 
+#include "fcntl.h" // meteor
+
 namespace node {
 
 using v8::Object;
@@ -67,6 +69,8 @@ void TTYWrap::Initialize(Handle<Object> target) {
 
   NODE_SET_PROTOTYPE_METHOD(t, "getWindowSize", TTYWrap::GetWindowSize);
   NODE_SET_PROTOTYPE_METHOD(t, "setRawMode", SetRawMode);
+  // meteor
+  NODE_SET_PROTOTYPE_METHOD(t, "setBlocking", TTYWrap::SetBlocking);
 
   NODE_SET_METHOD(target, "isTTY", IsTTY);
   NODE_SET_METHOD(target, "guessHandleType", GuessHandleType);
@@ -158,6 +162,39 @@ Handle<Value> TTYWrap::SetRawMode(const Arguments& args) {
 }
 
 
+// meteor
+Handle<Value> TTYWrap::SetBlocking(const Arguments& args) {
+  HandleScope scope;
+
+  UNWRAP(TTYWrap)
+
+  int fd = wrap->handle_.fd;
+  int set = args[0]->IsTrue();
+  int r = 0;
+
+  // implementation copied from uv__nonblock.
+  int flags;
+
+  if ((flags = fcntl(fd, F_GETFL)) == -1) {
+    r = -1;
+  } else {
+
+    // reverse of uv__nonblock. setBlocking vs setNonBlocking.
+    if (set) {
+      flags &= ~O_NONBLOCK;
+    } else {
+      flags |= O_NONBLOCK;
+    }
+
+    if (fcntl(fd, F_SETFL, flags) == -1) {
+      r = -1;
+    }
+  }
+
+  return scope.Close(Integer::New(r));
+}
+
+
 Handle<Value> TTYWrap::New(const Arguments& args) {
   HandleScope scope;
 
diff --git a/src/tty_wrap.h b/src/tty_wrap.h
index 4a3341a..01aa119 100644
--- a/src/tty_wrap.h
+++ b/src/tty_wrap.h
@@ -48,6 +48,7 @@ class TTYWrap : StreamWrap {
   static Handle<Value> IsTTY(const Arguments& args);
   static Handle<Value> GetWindowSize(const Arguments& args);
   static Handle<Value> SetRawMode(const Arguments& args);
+  static Handle<Value> SetBlocking(const Arguments& args); // meteor
   static Handle<Value> New(const Arguments& args);
 
   uv_tty_t handle_;
EOF


./configure --prefix="$DIR"
make -j4
make install PORTABLE=1
# PORTABLE=1 is a node hack to make npm look relative to itself instead
# of hard coding the PREFIX.

# export path so we use our new node for later builds
export PATH="$DIR/bin:$PATH"

which node

which npm

cd "$DIR/lib/node_modules"
npm install connect@1.9.2 # not 2.x yet. sockjs doesn't work w/ new connect
npm install gzippo@0.1.7
npm install optimist@0.3.4
npm install coffee-script@1.3.3
npm install less@1.3.0
npm install sass@0.5.0
npm install stylus@0.29.0
npm install nib@0.8.2
npm install mime@1.2.7
npm install semver@1.0.14
npm install handlebars@1.0.6-2
npm install mongodb@1.1.5
npm install uglify-js@1.3.3
npm install clean-css@0.6.0
npm install progress@0.0.5
npm install fibers@0.6.9
npm install useragent@1.1.0
npm install request@2.11.0
npm install http-proxy@0.8.2
npm install simplesmtp@0.1.20
npm install stream-buffers@0.2.3
npm install keypress@0.1.0
 # pinned at older version. 0.1.16+ uses mimelib, not mimelib-noiconv
 # which make the dev bundle much bigger. We need a better solution.
npm install mailcomposer@0.1.15

# Sockjs has a broken optional dependancy, and npm optional dependancies
# don't seem to quite work. Fake it out with a checkout.
git clone http://github.com/akdubya/rbytes.git
npm install sockjs@0.3.1
rm -rf rbytes


cd "$DIR"
curl "$MONGO_URL" | tar -xz
mv "$MONGO_NAME" mongodb

# don't ship a number of mongo binaries. they are big and unused. these
# could be deleted from git dev_bundle but not sure which we'll end up
# needing.
cd mongodb/bin
rm bsondump mongodump mongoexport mongofiles mongoimport mongorestore mongos mongosniff mongostat mongotop mongooplog mongoperf
cd ../..



echo BUNDLING

cd "$DIR"
echo "${BUNDLE_VERSION}" > .bundle_version.txt
rm -rf build

tar czf "${TARGET_DIR}/dev_bundle_${UNAME}_${ARCH}_${BUNDLE_VERSION}.tar.gz" .

echo DONE
