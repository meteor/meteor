#!/usr/bin/env bash

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
    echo "The passed commit is checked out and published from the remote machines." 1>&2
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
  env METEOR_SESSION_FILE="$SESSION_FILE" "$METEOR" login

  echo "${green}Login succeeded.${NC}"
  echo
  echo "Run the following commands in separate terminal windows:"
  echo

  # XXX there is no os.windows.x86_64 as we don't build for it at the moment
  PLATFORMS=( os.osx.x86_64 os.linux.x86_64 os.linux.x86_32 os.windows.x86_32 )
  for PLATFORM in ${PLATFORMS[@]}; do
    COMMAND="`dirname $0`/publish-meteor-tool-on-arch.sh $GITSHA $PLATFORM $SESSION_FILE"
    echo $COMMAND
  done

  trap - EXIT
}

clean_up () {
  if [[ "x$SESSION_FILE" != x ]]; then
    echo "Removing used session file."
    rm "$SESSION_FILE"
  fi

  exit 1
}

# '|| true' so that we don't fail on terminals without colors
red=`tput setaf 1 || true`
green=`tput setaf 2 || true`
NC=`tput sgr0 || true`

main $@

