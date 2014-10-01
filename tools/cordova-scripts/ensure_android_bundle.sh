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

"$(dirname "$0")/ensure_android_prereqs.sh"

cd "$ORIG_DIR"

install_android_bundle () {
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

set_config () {
  KEY=$1
  VALUE=$2

  CONFIG_FILE="${ANDROID_BUNDLE}/meteor_avd/config.ini"

  TEMP_FILE=`mktemp -t tmp.XXXXXXXXXX`
  grep -v "^${KEY}=" "${CONFIG_FILE}" > "${TEMP_FILE}"
  echo "${KEY}=${VALUE}" >> "${TEMP_FILE}"
  mv -f "${TEMP_FILE}" "${CONFIG_FILE}"
}

install_x86 () {
    echo "Android x86 System image not found.  Found targets:"
    android list target
    echo "Downloading x86 system image..."
    echo y | android update sdk -t sys-img-x86-android-19 --all -u > /dev/null 2>&1
}

# create avd if necessary
if [[ ! $("${ANDROID_BUNDLE}/android-sdk/tools/android" list avd | grep Name) ]] ; then
  #ABI="default/armeabi-v7a"
  ABI="default/x86"

  (android list target | grep ABIs | grep default/x86 > /dev/null) || install_x86

  # XXX if this command fails, it would be really hard to debug or understand
  # for the end user. But the output is also very misleading. Later we should
  # save the output to a log file and tell user where to find it in case of
  # failure.
  echo "
" | "${ANDROID_BUNDLE}/android-sdk/tools/android" create avd --target 1 --name meteor --abi ${ABI} --path "${ANDROID_BUNDLE}/meteor_avd/" > /dev/null 2>&1

  # Nice keyboard support
  set_config "hw.keyboard" "yes"
  set_config "hw.mainKeys" "no"

  # More RAM than the default
  set_config "hw.ramSize" "1024"
  set_config "vm.heapSize" "64"

  # These are the settings for a Nexus 4, but it's a bit big for some screens
  #  (and likely a bit slow without GPU & KVM/HAXM acceleration)
  #set_config "skin.dynamic" "yes"
  #set_config "hw.lcd.density" "320"
  #set_config "hw.device.name" "Nexus 4"
  #set_config "hw.device.manufacturer" "Google"

  # XXX: hw.gpu.enabled=yes ?

fi


