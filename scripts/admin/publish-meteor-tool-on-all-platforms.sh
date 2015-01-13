#!/bin/bash

# This scripts automates the release process of Meteor Tool.

# Normally, after publishing a new Meteor release from checkout, you need to ssh
# to a machine running every supported platform and publish a build from it.
# This script automates ssh'ing into machines and running the publish command.

set -e
set -u

TEMP_PRIV_KEY=
TEMP_KEY=
SESSION_FILE=

main () {
  if [ $# -ne 1 ]; then
    echo "usage: $0 GITSHA" 1>&2
    echo "The passed sha1 is checked out and published from the remote machines." 1>&2
    exit 1
  fi
  GITSHA=$1

  ADMIN_DIR="`dirname "$0"`"
  SCRIPTS_DIR="`dirname "$ADMIN_DIR"`"
  CHECKOUT_DIR="`dirname "$SCRIPTS_DIR"`"

  METEOR="$CHECKOUT_DIR/meteor"

  trap 'echo "${red}Login failed.${NC}"; clean_up' EXIT

  echo "${green}Login with a meteor account belonging to MDG."
  echo "A session file will be generated in your checkout and it will be used to"
  echo "publish the release from the remote machines.${NC}"

  SESSION_FILE="$CHECKOUT_DIR/publish-meteor-tool-session"
  env METEOR_SESSION_FILE=$SESSION_FILE $METEOR login

  echo "${green}Login succeeded.${NC}"

  trap - EXIT


  UNIX_PLATFORMS=( os.osx.x86_64 os.linux.x86_64 os.linux.x86_32 )
  WINDOWS_PLATFORMS=( os.windows.x86_32 os.windows.x86_64 )

  echo "${green}Publishing from unixy platforms.${NC}"
  for PLATFORM in ${UNIX_PLATFORMS[@]}; do
    parse_keys

    echo "${green}Going to ssh into machine running $PLATFORM and publish the release${NC}"
    trap 'echo "${red}Failed to publish from $PLATFORM${NC}"; clean_up' EXIT
    # copy the meteor session file to the remote host
    scp -oUserKnownHostsFile=$TEMP_KEY -P $PORT -i $TEMP_PRIV_KEY -q $SESSION_FILE $USERNAME@$HOST:~/session

    $METEOR admin get-machine $PLATFORM <<'END'
set -e
set -u
if [ -d meteor ]; then
  rm -rf meteor
fi
git clone https://github.com/meteor/meteor.git
cd meteor
git fetch --tags
END

    # checkout the SHA1 we want to publish
    echo "cd meteor; git checkout $GITSHA" | $METEOR admin get-machine $PLATFORM
    # publish the release
    echo "cd meteor/packages/meteor-tool && env METEOR_SESSION_FILE=~/session ../../meteor publish --existing-version" | $METEOR admin get-machine $PLATFORM

    trap - EXIT
  done

  echo "${green}Publishing from Windowsy platforms.${NC}"
  for PLATFORM in ${WINDOWS_PLATFORMS[@]}; do
    parse_keys

    echo "${green}Going to ssh into machine running $PLATFORM and publish the release${NC}"
    trap 'echo "${red}Failed to publish from $PLATFORM${NC}"; clean_up' EXIT

    # copy the meteor session file to the remote host
    SESSION_CONTENT=$(cat $SESSION_FILE | tr '\n' ' ')
    ssh $USERNAME@$HOST -oUserKnownHostsFile=$TEMP_KEY -p $PORT -i $TEMP_PRIV_KEY "cmd /c echo $SESSION_CONTENT > C:\\meteor-session"

    # checkout the SHA1 we want to publish and publish it
    SCRIPT="( \
IF EXIST C:\\tmp ( rmdir /s /q C:\\tmp ) && \
md C:\\tmp && \
cd C:\\tmp && \
C:\\git\\bin\\git.exe clone https://github.com/meteor/meteor.git && \
cd meteor && \
C:\\git\\bin\\git.exe fetch --tags && \
C:\\git\\bin\\git.exe checkout $GITSHA && \
cd C:\\tmp\\meteor\\packages\\meteor-tool && \
set METEOR_SESSION_FILE=C:\\meteor-session && \
rem install 7zip && \
C:\\git\\bin\\curl -L http://downloads.sourceforge.net/sevenzip/7z920-x64.msi >
 C:\\7z.msi && \
msiexec /i C:\\7z.msi /quiet /qn /norestart && \
set PATH=%PATH%;\"C:\\Program Files\\7-zip\" && \
rem allow powershell script execution && \
powershell \"Set-ExecutionPolicy RemoteSigned\" && \
..\\..\\meteor.bat publish --existing-version \
) || exit 1 \
"
    ssh $USERNAME@$HOST -oUserKnownHostsFile=$TEMP_KEY -p $PORT -i $TEMP_PRIV_KEY "cmd /c $SCRIPT"

    trap - EXIT
  done
}

# get keys from "meteor admin get-machine" command
parse_keys () {
  trap 'echo "${red}Failed to parse the machine credentials${NC}";clean_up' EXIT
  CREDS=$($METEOR admin get-machine $PLATFORM --json)

  # save host key and login private key to temp files
  echo $CREDS | get_from_json "key" > $CHECKOUT_DIR/temp_priv_key
  TEMP_PRIV_KEY=$CHECKOUT_DIR/temp_priv_key
  chmod 600 $TEMP_PRIV_KEY

  USERNAME=$(echo $CREDS | get_from_json "username")
  HOST=$(echo $CREDS | get_from_json "host")
  PORT=$(echo $CREDS | get_from_json "port")
  echo -n "$HOST " > $CHECKOUT_DIR/temp_key
  echo $CREDS | get_from_json "hostKey" >> $CHECKOUT_DIR/temp_key
  TEMP_KEY=$CHECKOUT_DIR/temp_key

  trap - EXIT
}

# print a value from a JSON file by key
get_from_json () {
  "$CHECKOUT_DIR/dev_bundle/bin/node" -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin').toString())['$1'])"
}

clean_up () {
  if [[ x$TEMP_KEY != x ]]; then
    echo "Removing remaining keys"
    rm $TEMP_KEY
  fi
  if [[ x$TEMP_KEY != x ]]; then
    rm $TEMP_PRIV_KEY
  fi

  if [[ x$SESSION_FILE != x ]]; then
    echo "Removing used session file."
    rm $SESSION_FILE
  fi

  exit 1
}

red=`tput setaf 1`
green=`tput setaf 2`
NC=`tput sgr0`

main $@

