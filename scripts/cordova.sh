#!/bin/bash

# below copied from Meteor script

BUNDLE_VERSION=0.1

# OS Check. Put here because here is where we download the precompiled
# bundles that are arch specific.
UNAME=$(uname)
if [ "$UNAME" != "Linux" -a "$UNAME" != "Darwin" ] ; then
  echo "Sorry, this OS is not supported."
  exit 1
fi

# Find the script dir, following one level of symlink. Note that symlink
# can be relative or absolute. Too bad 'readlink -f' is not portable.
ORIG_DIR=$(pwd)
cd "$(dirname "$0")"
if [ -L "$(basename "$0")" ] ; then
    cd "$(dirname $(readlink $(basename "$0") ) )"
fi
SCRIPT_DIR=$(pwd -P)/..
cd "$ORIG_DIR"

function install_android_bundle {
  set -e
  trap "echo Failed to install dependency kit." EXIT

  TARBALL="android_bundle_${UNAME}_${BUNDLE_VERSION}.tar.gz"
  BUNDLE_TMPDIR="$SCRIPT_DIR/android_bundle.xxx"

  rm -rf "$BUNDLE_TMPDIR"
  mkdir "$BUNDLE_TMPDIR"

  ANDROID_BUNDLE_URL_ROOT="http://s3.amazonaws.com/android-bundle/"

  if [ -f "$SCRIPT_DIR/$TARBALL" ] ; then
      echo "Skipping download and installing kit from $SCRIPT_DIR/$TARBALL" >&2
      tar -xzf "$SCRIPT_DIR/$TARBALL" -C "$BUNDLE_TMPDIR"
  else
      curl -# "$ANDROID_BUNDLE_URL_ROOT$TARBALL" | tar -xzf - -C "$BUNDLE_TMPDIR"
  fi

  # Delete old dev bundle and rename the new one on top of it.
  rm -rf "$SCRIPT_DIR/android_bundle"
  mv "$BUNDLE_TMPDIR" "$SCRIPT_DIR/android_bundle"

  echo "Installed dependency kit v${BUNDLE_VERSION} in android_bundle." >&2
  echo >&2

  trap - EXIT
  set +e
}

if [ -d "$SCRIPT_DIR/.git" ] || [ -f "$SCRIPT_DIR/.git" ]; then
  # In a checkout.
  if [ ! -d "$SCRIPT_DIR/android_bundle" ] ; then
    install_android_bundle
  elif [ ! -f "$SCRIPT_DIR/android_bundle/.bundle_version.txt" ] ||
    # we might need an android bundle version?
    grep -qvx "$BUNDLE_VERSION" "$SCRIPT_DIR/android_bundle/.bundle_version.txt" ; then
    install_android_bundle
  fi

  ANDROID_BUNDLE="$SCRIPT_DIR/android_bundle"
  DEV_BUNDLE="$SCRIPT_DIR/dev_bundle"
else
  # In an install
  ANDROID_BUNDLE=$(dirname "$SCRIPT_DIR")
fi

export PATH=${ANDROID_BUNDLE}/android-sdk/tools:${ANDROID_BUNDLE}/android-sdk/platform-tools:${PATH};

export ANT_HOME=${ANDROID_BUNDLE}/apache-ant-1.9.4
export PATH=${ANT_HOME}/bin:${PATH}

exec ${DEV_BUNDLE}/lib/node_modules/cordova/bin/cordova "$@"