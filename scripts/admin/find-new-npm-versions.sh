#!/usr/bin/env bash
BASEDIR=`dirname $0`
cat $BASEDIR/generate-dev-bundle.sh | grep "npm install" | sed "s/npm install //" | sed "s/@.*//" | while read PACKAGE
do
  CURRENT_VERSION=`cat $BASEDIR/generate-dev-bundle.sh | grep "npm install $PACKAGE" | sed "s/npm install //" | sed "s/.*@//"`
  LATEST_VERSION=`$BASEDIR/../dev_bundle/bin/npm info $PACKAGE version 2> /dev/null`
  if [ "$CURRENT_VERSION" != "$LATEST_VERSION" ]
  then
    echo "$PACKAGE -- current version: $CURRENT_VERSION, latest version: $LATEST_VERSION"
  fi
done
