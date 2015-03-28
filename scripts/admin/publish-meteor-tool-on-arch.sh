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
  if [ $# -ne 3 ]; then
    echo "usage: $0 <git sha> <platform> <path to meteor session>" 1>&2
    echo "The passed sha1 is checked out and published from the machines." 1>&2
    echo "Options for platform:" 1>&2
    echo "  os.osx.x86_64 os.linux.x86_64 os.linux.x86_32" 1>&2
    echo "  os.windows.x86_32 os.windows.x86_64" 1>&2
    exit 1
  fi

  GITSHA=$1
  PLATFORM=$2
  SESSION_FILE=$3

  ADMIN_DIR="`dirname "$0"`"
  SCRIPTS_DIR="`dirname "$ADMIN_DIR"`"
  CHECKOUT_DIR="`dirname "$SCRIPTS_DIR"`"

  METEOR="$CHECKOUT_DIR/meteor"

  UNIX_PLATFORMS=( os.osx.x86_64 os.linux.x86_64 os.linux.x86_32 )
  WINDOWS_PLATFORMS=( os.windows.x86_32 os.windows.x86_64 )

  if [[ $PLATFORM =~ ^(os\.linux|os\.osx) ]] ; then
    echo "${green}Publishing from unixy platform.${NC}"

    parse_keys

    echo "${green}Going to ssh into machine running $PLATFORM and publish the release${NC}"
    trap 'echo "${red}Failed to publish from $PLATFORM${NC}"; clean_up' EXIT
    # copy the meteor session file to the remote host
    scp -oUserKnownHostsFile="$TEMP_KEY" -P "$PORT" -i "$TEMP_PRIV_KEY" -q "$SESSION_FILE" $USERNAME@$HOST:~/session

    METEOR_SESSION_FILE="$SESSION_FILE" "$METEOR" admin get-machine --minutes 30 $PLATFORM <<'END'
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
    echo "cd meteor; git checkout $GITSHA" | METEOR_SESSION_FILE="$SESSION_FILE" "$METEOR" admin get-machine "$PLATFORM"
    # publish the release
    echo "cd meteor/packages/meteor-tool && env METEOR_SESSION_FILE=~/session ../../meteor publish --existing-version" | METEOR_SESSION_FILE=$SESSION_FILE $METEOR admin get-machine $PLATFORM

    trap - EXIT
  else
    echo "${green}Publishing from Windowsy platform.${NC}"

    parse_keys

    echo "${green}Going to ssh into machine running $PLATFORM and publish the release${NC}"
    trap 'echo "${red}Failed to publish from $PLATFORM${NC}"; clean_up' EXIT

    # copy the meteor session file to the remote host
    SESSION_CONTENT=$(cat $SESSION_FILE | tr '\n' ' ')
    ssh $USERNAME@$HOST -oUserKnownHostsFile="$TEMP_KEY" -p "$PORT" -i "$TEMP_PRIV_KEY" "cmd /c echo $SESSION_CONTENT > C:\\meteor-session" 2>/dev/null

    # delete existing batch script if it exists
    ssh $USERNAME@$HOST -oUserKnownHostsFile="$TEMP_KEY" -p "$PORT" -i "$TEMP_PRIV_KEY" "cmd /c del C:\\publish-tool.bat || exit 0" 2>/dev/null

    # copy batch script to windows machine
    BAT_FILENAME="$ADMIN_DIR/publish-meteor-tool.bat"

    # we need to use file descriptor 10 because otherwise SSH will conflict with
    # the while loop
    while read -u10 -r line
    do
      line="${line/\$GITSHA/$GITSHA}"

      # skip empty lines and comments
      if [[ x$line == x ]] || [[ $line == "REM "* ]]; then
        continue
      fi

      echo $line
      ssh $USERNAME@$HOST -oUserKnownHostsFile="$TEMP_KEY" -p "$PORT" -i "$TEMP_PRIV_KEY" "cmd /c echo $line>> C:\\publish-tool.bat" 2>/dev/null
    done 10< "$BAT_FILENAME"

    ssh $USERNAME@$HOST -oUserKnownHostsFile=$TEMP_KEY -p $PORT -i $TEMP_PRIV_KEY "C:\\publish-tool.bat"

    trap - EXIT
  fi

  clean_up
}

# get keys from "meteor admin get-machine" command
parse_keys () {
  trap 'echo "${red}Failed to parse the machine credentials${NC}";clean_up' EXIT
  CREDS=$(METEOR_SESSION_FILE="$SESSION_FILE" "$METEOR" admin get-machine $PLATFORM --json)

  # save host key and login private key to temp files
  echo "$CREDS" | get_from_json "key" > "$CHECKOUT_DIR/temp_priv_key_$PLATFORM"
  TEMP_PRIV_KEY="$CHECKOUT_DIR/temp_priv_key_$PLATFORM"
  chmod 600 "$TEMP_PRIV_KEY"

  USERNAME=$(echo $CREDS | get_from_json "username")
  HOST=$(echo $CREDS | get_from_json "host")
  PORT=$(echo $CREDS | get_from_json "port")
  echo -n "$HOST " > "$CHECKOUT_DIR/temp_key_$PLATFORM"
  echo $CREDS | get_from_json "hostKey" >> "$CHECKOUT_DIR/temp_key_$PLATFORM"

  TEMP_KEY="$CHECKOUT_DIR/temp_key_$PLATFORM"

  trap - EXIT
}

# print a value from a JSON file by key
get_from_json () {
  "$CHECKOUT_DIR/dev_bundle/bin/node" -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin').toString())['$1'])"
}

clean_up () {
  if [[ "x$TEMP_KEY" != x ]]; then
    echo "Removing remaining keys"
    rm "$TEMP_KEY"
  fi
  if [[ "x$TEMP_PRIV_KEY" != x ]]; then
    rm "$TEMP_PRIV_KEY"
  fi

  exit 1
}

# '|| true' so that we don't fail on terminals without colors
red=`tput setaf 1 || true`
green=`tput setaf 2 || true`
NC=`tput sgr0 || true`

main $@

