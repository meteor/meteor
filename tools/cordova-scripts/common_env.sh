# to be sourced by other scripts

# WAREHOUSE_DIR variable check.
if [ x == x"$METEOR_WAREHOUSE_DIR" ]; then
  echo "Set METEOR_WAREHOUSE_DIR environment variable pointing at current warehouse."
  echo $0
  exit 1
fi

# Find the script dir, following one level of symlink. Note that symlink
# can be relative or absolute. Too bad 'readlink -f' is not portable.
ORIG_DIR=$(pwd)
cd "$(dirname "$0")"
if [ -L "$(basename "$0")" ] ; then
    cd "$(dirname $(readlink $(basename "$0") ) )"
fi

# SCRIPT_DIR is a directory containing the called `meteor` script
SCRIPT_DIR="$(pwd -P)/../.."
cd "$ORIG_DIR"


if [ -d "$SCRIPT_DIR/.git" ] || [ -f "$SCRIPT_DIR/.git" ]; then
  BUNDLE_ROOT_DIR=$SCRIPT_DIR
else
  BUNDLE_ROOT_DIR=$METEOR_WAREHOUSE_DIR
fi

# XXX is android_bundle still stored this way? Fix this line once it is a
# separate package that is a dependency of meteor-tool.
ANDROID_BUNDLE="$BUNDLE_ROOT_DIR/android_bundle"

# Devbundle is still stored in meteor-tool
DEV_BUNDLE="$SCRIPT_DIR/dev_bundle"

# Put ios-sim and ios-deploy binaries' paths into path
export PATH="${DEV_BUNDLE}/lib/ios-sim:${DEV_BUNDLE}/lib/ios-deploy:${PATH}"

if [ -z "$USE_GLOBAL_ADK" ] ; then
  # Put Android build tool-chain into path
  export PATH="${ANDROID_BUNDLE}/android-sdk/tools:${ANDROID_BUNDLE}/android-sdk/platform-tools:${PATH}"

  # add ant
  export ANT_HOME="${ANDROID_BUNDLE}/apache-ant-1.9.4"
  export PATH="${ANT_HOME}/bin:${PATH}"

  export HOME="${ANDROID_BUNDLE}"
  export ANDROID_SDK_HOME="${ANDROID_BUNDLE}"
else
  # to use a global ADK we don't set PATH, ANT_HOME, ANDROID_SDK_HOME
  # relying that they are installed and available globally
  true
fi

# add node
export PATH="${DEV_BUNDLE}/bin:${PATH}"
export NODE_PATH="${DEV_BUNDLE}/lib/node_modules"

