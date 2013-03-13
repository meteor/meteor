#!/bin/bash

set -e
set -u
set -o pipefail  # so curl failure triggers the "set -e"

BOOTSTRAP_URL='https://install-bootstrap.meteor.com/'

if [ ! -x "$HOME/.meteor/meteor" ]; then
  if [ -e "$HOME/.meteor" ]; then
    echo "'$HOME/.meteor' exists, but '$HOME/.meteor/meteor' is not executable."
    echo
    echo "Remove it and try again."
    exit 1
  fi

  # Bootstrap .meteor from a tarball. First, figure out our architecture.

  UNAME=$(uname)
  if [ "$UNAME" != "Linux" -a "$UNAME" != "Darwin" ] ; then
      echo "Sorry, this OS is not supported yet."
      exit 1
  fi

  if [ "$UNAME" = "Darwin" ] ; then
    if [ "i386" != $(uname -p) -o "1" != $(sysctl -n hw.cpu64bit_capable 2>/dev/null || echo 0) ] ; then
      # Can't just test uname -m = x86_64, because Snow Leopard can
      # return other values.
      echo "Only 64-bit Intel processors are supported at this time."
      exit 1
    fi
    ARCH="x86_64"
  elif [ "$UNAME" = "Linux" ] ; then
    ARCH="$(uname -m)"
    if [ "$ARCH" != "i686" -a "$ARCH" != "x86_64" ] ; then
      echo "Unsupported architecture: $ARCH"
      echo "Meteor only supports i686 and x86_64 for now."
      exit 1
    fi
  fi

  # This returns something like https://warehouse.meteor.com/engines/db68972b9d239a95bffa3abe652d1e17815dba91
  ROOT_URL="$(curl -s --fail $BOOTSTRAP_URL)"
  TARBALL_URL="${ROOT_URL}/meteor-engine-bootstrap-${UNAME}-${ARCH}.tar.gz"

  INSTALL_TMPDIR="$HOME/.meteor-install-tmp"
  rm -rf "$INSTALL_TMPDIR"
  mkdir "$INSTALL_TMPDIR"
  echo 'This is your first time using Meteor! Downloading the engine now.'
  curl --progress-bar --fail "$TARBALL_URL" | tar -xzf - -C "$INSTALL_TMPDIR"
  # bomb out if it didn't work, eg no net
  test -x "${INSTALL_TMPDIR}/.meteor/meteor"
  mv "${INSTALL_TMPDIR}/.meteor" "$HOME"
  rmdir "${INSTALL_TMPDIR}"
  # just double-checking :)
  test -x "$HOME/.meteor/meteor"
fi

exec "$HOME/.meteor/meteor" "$@"
