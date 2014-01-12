#!/bin/bash
#
# Runs migrations from the command line.
#
# Ex1: ./migrate.sh latest - Migrates up to the latest version.
# Ex2: ./migrate.sh 2 - Migrates up or down to the specified version.
# Ex3: ./migrate.sh latest --settings ../settings.json - Migrates up to the 
#      latest version and passes extra arguments to meteor.
#
# Note, calls meteor. If you're using mrt and require a specific version of 
# meteor, you change line 22 of this script to 'mrt'.

if test -z "$1"
then
  echo "usage: $0 version [meteor_args...]"
  echo "       The special version 'latest' will migrate to the latest version."
  exit 1
else
  export MIGRATE="$1,exit"
  shift

  meteor --once --run $@
fi
