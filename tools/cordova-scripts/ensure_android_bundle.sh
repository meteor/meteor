#!/bin/bash
BUNDLE_VERSION=0.1

# OS Check. Put here because here is where we download the precompiled
# bundles that are arch specific.
UNAME=$(uname)
if [ "$UNAME" != "Linux" -a "$UNAME" != "Darwin" ] ; then
  echo "Sorry, this OS is not supported."
  exit 1
fi

# import all the environment
source $(dirname $0)/common_env.sh

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


cd "$ORIG_DIR"


if [ -z "$USE_GLOBAL_ADK" ] ; then
  # not using global ADK
  true
else
  # using global ADK, check all utilities
  set -e
  trap "echo One of the required utilities wasn't found in global PATH: java javac ant android" EXIT

  which java
  which javac
  which ant
  which android

  trap - EXIT
  set +e
  exit 0
fi

install_android_bundle () {
  echo "Going to install Android Bundle (300M-400M)."
  echo "This might take a while, please hold on."

  set -e
  trap "echo Failed to install dependency kit." EXIT

  TARBALL="android_bundle_${UNAME}_${BUNDLE_VERSION}.tar.gz"
  DEST_DIR=$(dirname "$ANDROID_BUNDLE")
  BUNDLE_TMPDIR="$DEST_DIR/android_bundle.xxx"

  rm -rf "$BUNDLE_TMPDIR"
  mkdir "$BUNDLE_TMPDIR"

  ANDROID_BUNDLE_URL_ROOT="http://s3.amazonaws.com/android-bundle/"

  if [ -f "$DEST_DIR/$TARBALL" ] ; then
      echo "Skipping download and installing kit from $DEST_DIR/$TARBALL" >&2
      tar -xzf "$DEST_DIR/$TARBALL" -C "$BUNDLE_TMPDIR"
  else
      curl "$ANDROID_BUNDLE_URL_ROOT$TARBALL" | tar -xzf - -C "$BUNDLE_TMPDIR"
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

command -v javac >/dev/null 2>&1 || {
  echo >&2 "To add the android platform, please install a JDK. Here are some directions: http://openjdk.java.net/install/"; exit 1;
}


# create avd if necessary
if [[ ! $("${ANDROID_BUNDLE}/android-sdk/tools/android" list avd | grep Name) ]] ; then
  #ABI="default/armeabi-v7a"
  ABI="default/x86"

  echo "
" | "${ANDROID_BUNDLE}/android-sdk/tools/android" create avd --target 1 --name meteor --abi ${ABI} --path ${ANDROID_BUNDLE}/meteor_avd/ 1>&2
fi


