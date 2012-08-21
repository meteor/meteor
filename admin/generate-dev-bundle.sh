#!/bin/bash

set -e

BUNDLE_VERSION=0.1.6
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
elif [[ "$UNAME" == CYGWIN* || "$UNAME" == MINGW* ]] ; then
	# Bitness does not matter on Windows, thus we don't check it here.

	# We check that all of the required tools are present for people that want to make a dev bundle on Windows.
	command -v git >/dev/null 2>&1 || { echo >&2 "I require 'git' but it's not installed. Aborting."; exit 1; }
	command -v mktemp >/dev/null 2>&1 || { echo >&2 "I require 'mktemp' but it's not installed. Aborting."; exit 1; }
	command -v curl >/dev/null 2>&1 || { echo >&2 "I require 'curl' but it's not installed. Aborting."; exit 1; }
	command -v unzip >/dev/null 2>&1 || { echo >&2 "I require 'unzip' but it's not installed. Aborting."; exit 1; }
	command -v tar >/dev/null 2>&1 || { echo >&2 "I require 'tar' but it's not installed. Aborting."; exit 1; }

        # XXX Can be adapted to support both 32-bit and 64-bit, currently supports only 32-bit (2 GB memory limit).
	MONGO_NAME="mongodb-win32-i386-2.0.7"
	MONGO_URL="http://downloads.mongodb.org/win32/${MONGO_NAME}.zip"
else
    echo "This OS not yet supported"
    exit 1
fi


# save off meteor checkout dir as final target
cd `dirname $0`/..
TARGET_DIR=`pwd`

DIR=`mktemp -d -t generate-dev-bundle-XXXXXXXX`
trap 'rm -rf "$DIR" >/dev/null 2>&1' 0

cd "$DIR"
chmod 755 .
umask 022

if [[ "$UNAME" == CYGWIN* || "$UNAME" == MINGW* ]] ; then
	# XXX Only install node if it is not yet present.
    #     To be able to install Node.js locally instead of to Program Files, we need to wait for https://github.com/joyent/node/issues/2279.
	command -v node >/dev/null 2>&1 || {
		echo DOWNLOADING NODE.JS IN "$DIR"
		echo.

		# Make sure we are on a version that passes the node-fibers tests on Windows.
		curl -O http://nodejs.org/dist/v0.6.19/node-v0.6.19.msi

		echo.
		echo INSTALLING NODE.JS
		echo.

		# Let's install node.js (includes v8 and npm).
		$COMSPEC \/c node-v0.6.19.msi\ \/qr; true
		rm node-v0.6.19.msi

		# Make sure we can see node and npm from now on.
		export PATH="/c/Program Files (x86)/nodejs:/c/Program Files/nodejs:$PATH"
	}
else
	echo BUILDING IN "$DIR"

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
fi

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

if [[ "$UNAME" != CYGWIN* && "$UNAME" != MINGW* ]] ; then
	export JOBS=4
	./configure --prefix="$DIR" ${NODE_CONFIG_FLAGS[*]}
	make
	make install

	# export path so we use our new node for later builds
	export PATH="$DIR/bin:$PATH"
fi

which node

which npm

if [[ "$UNAME" == CYGWIN* || "$UNAME" == MINGW* ]] ; then
	# XXX On Windows node is installed in Program Files, so we jump there for the moment.
	NODE=$(which node)
	cd "${NODE}_modules"
else
	cd "$DIR/lib/node_modules"
fi

rm -rf connect gzippo optimist coffee-script less sass stylus mime semver handlebars mongodb uglify-js clean-css progress fibers useragent request http-proxy connect-gzip sockjs
npm install "connect@1.8.7" # not 2.x yet. sockjs doesn't work w/ new connect
npm install "gzippo@0.1.7"
npm install "optimist@0.3.1"
npm install "coffee-script@1.3.1"
npm install "less@1.3.0"
npm install "sass@0.5.0"
npm install "stylus@0.28.1"
npm install "nib@0.7.0"
npm install "mime@1.2.5"
npm install "semver@1.0.13"
npm install "handlebars@1.0.5beta"
npm install "mongodb@0.9.9-8"
npm install "uglify-js@1.2.6"
npm install "clean-css@0.3.2"
npm install "progress@0.0.4"
if [[ "$UNAME" == CYGWIN* || "$UNAME" == MINGW* ]] ; then
	# Windows support became avalaible at version 0.6.7 in node-fibers.
	npm install "fibers@0.6.7"
else
	npm install "fibers@0.6.5"
fi
npm install "useragent@1.0.6"
npm install "request@2.9.202"
npm install "http-proxy@0.8.0"

# unused, but kept in bundle for compatibility for a while.
npm install "connect-gzip@0.1.5"

# Sockjs has a broken optional dependancy, and npm optional dependancies
# don't seem to quite work. Fake it out with a checkout.
git clone http://github.com/akdubya/rbytes.git
npm install "sockjs@0.3.1"
rm -rf rbytes

# Disable mtime check in fibers. Fixes problem when packaging tools
# don't preserve mtimes.
if [[ "$UNAME" != CYGWIN* && "$UNAME" != MINGW* ]] ; then
	cat > fibers/fibers.js <<EOF
// meteor removed mtime check here.

// Injects 'Fiber' and 'yield' in to global
require('./src/fibers');
EOF
fi

cd "$DIR"
curl -O "$MONGO_URL"
if [[ "$UNAME" == CYGWIN* || "$UNAME" == MINGW* ]] ; then
	# The Windows distribution of MONGO comes in a different format, unzip accordingly.
	unzip "${MONGO_NAME}.zip"
	rm "${MONGO_NAME}.zip"
else
	tar -xz "${MONGO_NAME}.tgz"
fi
mv "$MONGO_NAME" mongodb

# don't ship a number of mongo binaries. they are big and unused. these
# could be deleted from git dev_bundle but not sure which we'll end up
# needing.
cd mongodb/bin
if [[ "$UNAME" == CYGWIN* || "$UNAME" == MINGW* ]] ; then
	# The Windows distribution of MONGO comes in a different format, we need to specify ".exe" and "monogosniff.exe" misses.
	rm bsondump.exe mongodump.exe mongoexport.exe mongofiles.exe mongoimport.exe mongorestore.exe mongos.exe mongostat.exe mongotop.exe
else
	rm bsondump mongodump mongoexport mongofiles mongoimport mongorestore mongos mongosniff mongostat mongotop
fi
cd ../..

echo BUNDLING

if [[ "$UNAME" == CYGWIN* || "$UNAME" == MINGW* ]] ; then
	# XXX On Windows we make sure Node.js is bundled along in a proper way.
	#     To be able to place Node.js here straight away instead of copying Program Files, we need to wait for https://github.com/joyent/node/issues/2279.
	NODE=$(which node)
	cd "${NODE}_modules"
	cd ..
	mkdir $DIR/bin
	mkdir $DIR/lib
	cp -R . $DIR/bin
	cp -R $DIR/bin/node_modules $DIR/lib/node_modules
fi

cd "$DIR"
echo "${BUNDLE_VERSION}" > .bundle_version.txt

# If not on Windows, we did build node.js; so, we need to remove the build directory.
if [[ "$UNAME" != CYGWIN* && "$UNAME" != MINGW* ]] ; then
	rm -rf build
fi

tar czf "${TARGET_DIR}/dev_bundle_${UNAME}_${ARCH}_${BUNDLE_VERSION}.tar.gz" .

echo DONE
