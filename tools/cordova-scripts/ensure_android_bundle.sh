#!/bin/bash

set -e

BUNDLE_VERSION=0.1

# OS Check. Put here because here is where we download the precompiled
# bundles that are arch specific.
UNAME=$(uname)
if [ "$UNAME" != "Linux" -a "$UNAME" != "Darwin" ] ; then
  echo "Sorry, this OS is not supported."
  exit 1
fi

# import all the environment
source "$(dirname "$0")/common_env.sh"

#"$(dirname "$0")/ensure_android_prereqs.sh"

cd "$ORIG_DIR"

install_android_bundle () {
  echo ""
  echo "Installing Android development bundle."
  echo "This might take a while, please hold on."

  set -e
  trap "echo Failed to install dependency kit." EXIT

  TARBALL="android_bundle_${UNAME}_${BUNDLE_VERSION}.tar.gz"
  DEST_DIR=$(dirname "$ANDROID_BUNDLE")
  BUNDLE_TMPDIR="$DEST_DIR/android_bundle.xxx"

  rm -rf "$BUNDLE_TMPDIR"
  mkdir "$BUNDLE_TMPDIR"

  ANDROID_BUNDLE_URL_ROOT="https://warehouse.meteor.com/cordova/"

  if [ -f "$DEST_DIR/$TARBALL" ] ; then
      echo "Skipping download and installing kit from $DEST_DIR/$TARBALL" >&2
      tar -xzf "$DEST_DIR/$TARBALL" -C "$BUNDLE_TMPDIR"
  else
      curl --progress-bar "$ANDROID_BUNDLE_URL_ROOT$TARBALL" | tar -xzf - -C "$BUNDLE_TMPDIR"
  fi

  # Delete old dev bundle and rename the new one on top of it.
  rm -rf "$DEST_DIR/android_bundle"
  mv "$BUNDLE_TMPDIR" "$DEST_DIR/android_bundle"

  echo "Installed dependency kit v${BUNDLE_VERSION} in android_bundle." >&2
  echo >&2

  trap - EXIT
  set +e;
}

if [ ! -d "$ANDROID_BUNDLE" ] ; then
  install_android_bundle
elif [ ! -f "$ANDROID_BUNDLE/.bundle_version.txt" ] ||
  # we might need an android bundle version?
  grep -qvx "$BUNDLE_VERSION" "$ANDROID_BUNDLE/.bundle_version.txt" ; then
  install_android_bundle
fi
