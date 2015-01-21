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

command -v java >/dev/null 2>&1 || {
  if [ ${UNAME} == "Linux" ] ; then
    echo "Please install a Java JDK before running this command.";
    echo "Directions can be found at: http://openjdk.java.net/install/"
    echo ""

    #DISTRO=`lsb_release --id --short 2>/dev/null` || DISTRO=""
    PROCESSOR=`uname --processor 2>/dev/null` || PROCESSOR=""
    HAS_YUM=`yum --version 2>/dev/null` || HAS_YUM=""
    HAS_APT_GET=`apt-get --help 2>/dev/null` || HAS_APT_GET=""

    if [[ "${HAS_APT_GET}" != "" ]] ; then
      echo "You can install the JDK using:"
      echo "  apt-get install openjdk-7-jdk"

      if [[ "${PROCESSOR}" == "x86_64" ]] ; then
        echo ""
        echo "You will also need some 32-bit libraries:"
        echo "  apt-get install lib32z1 lib32stdc++6"
      fi
    fi

    if [[ "${HAS_YUM}" != "" ]] ; then
      echo "You can install the JDK using:"
      echo "  yum install -y java-1.7.0-openjdk-devel"

      if [[ "${PROCESSOR}" == "x86_64" ]] ; then
        echo ""
        echo "You will also need some 32-bit libraries:"
        echo "  yum install -y glibc.i686 zlib.i686 libstdc++.i686 ncurses-libs.i686"
      fi
    fi


  else
    echo "The android platform needs a Java JDK to be installed on your system."
    # This effectively does this...
    # open "http://www.oracle.com/technetwork/java/javase/downloads/index.html"
    java -version 2> /dev/null
  fi

  exit 1;
}

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

command -v javac >/dev/null 2>&1 || {
  echo >&2 "To add the android platform, please install a JDK. Here are some directions: http://openjdk.java.net/install/"; exit 1;
}
