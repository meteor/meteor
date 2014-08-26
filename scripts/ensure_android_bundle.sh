#!/bin/bash
BUNDLE_VERSION=0.1

# OS Check. Put here because here is where we download the precompiled
# bundles that are arch specific.
UNAME=$(uname)
if [ "$UNAME" != "Linux" -a "$UNAME" != "Darwin" ] ; then
  echo "Sorry, this OS is not supported."
  exit 1
fi

command -v java >/dev/null 2>&1 || {
  if [ ${UNAME} == "Linux" ] ; then
    echo "Please install Java before running this command.";
    echo "Directions can be found at: http://openjdk.java.net/install/"
  else
    echo "The android platform needs Java to be installed on your system."
    java -version
  fi

  exit 1;
}


# Find the script dir, following one level of symlink. Note that symlink
# can be relative or absolute. Too bad 'readlink -f' is not portable.
ORIG_DIR=$(pwd)
cd "$(dirname "$0")"
if [ -L "$(basename "$0")" ] ; then
    cd "$(dirname $(readlink $(basename "$0") ) )"
fi
SCRIPT_DIR=$(pwd -P)/..

cd "$ORIG_DIR"

install_android_bundle () {
  echo "Going to install Android Bundle (300M-400M)."
  echo "This might take a while, please hold on."

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
      curl "$ANDROID_BUNDLE_URL_ROOT$TARBALL" | tar -xzf - -C "$BUNDLE_TMPDIR"
  fi

  # Delete old dev bundle and rename the new one on top of it.
  rm -rf "$SCRIPT_DIR/android_bundle"
  mv "$BUNDLE_TMPDIR" "$SCRIPT_DIR/android_bundle"

  echo "Installed dependency kit v${BUNDLE_VERSION} in android_bundle." >&2
  echo >&2

  trap - EXIT
  set +e;
}

# No matter if we are in the checkout or not, try to install the android_bundle
if [ ! -d "$SCRIPT_DIR/android_bundle" ] ; then
  install_android_bundle
elif [ ! -f "$SCRIPT_DIR/android_bundle/.bundle_version.txt" ] ||
  # we might need an android bundle version?
  grep -qvx "$BUNDLE_VERSION" "$SCRIPT_DIR/android_bundle/.bundle_version.txt" ; then
  install_android_bundle
fi

command -v javac >/dev/null 2>&1 || {
  echo >&2 "To add the android platform, please install a JDK. Here are some directions: http://openjdk.java.net/install/"; exit 1;
}


ANDROID_BUNDLE="$SCRIPT_DIR/android_bundle"

# Put Android build tool-chain into path
export PATH=${ANDROID_BUNDLE}/android-sdk/tools:${ANDROID_BUNDLE}/android-sdk/platform-tools:${PATH}

# add ant
export ANT_HOME=${ANDROID_BUNDLE}/apache-ant-1.9.4
export PATH=${ANT_HOME}/bin:${PATH}

export HOME=${ANDROID_BUNDLE}

# create avd if necessary
if [[ ! $("${ANDROID_BUNDLE}/android-sdk/tools/android" list avd | grep Name) ]] ; then
  echo "
" | "${ANDROID_BUNDLE}/android-sdk/tools/android" create avd --target 1 --name meteor --abi default/armeabi-v7a --path ${ANDROID_BUNDLE}/meteor_avd/ 1>&2
fi


