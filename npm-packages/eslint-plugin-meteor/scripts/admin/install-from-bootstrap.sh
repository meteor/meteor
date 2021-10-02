#!/usr/bin/env bash

set -e
set -u

if [ $# -ne 1 ]; then
    echo "usage: install-from-bootstrap.sh meteor-bootstrap.tgz" 1>&2
    exit 1
fi

TARBALL="$1"
INSTALL_TMPDIR="$HOME/.meteor-install-tmp"

# Overwrite existing tropohouse/warehouse.
[ -e "$HOME/.meteor" ] && rm -rf "$HOME/.meteor"


rm -rf "${INSTALL_TMPDIR}"
mkdir "${INSTALL_TMPDIR}"
tar -xzf "$TARBALL" -C "${INSTALL_TMPDIR}"

# bomb out if it didn't work
test -x "${INSTALL_TMPDIR}/.meteor/meteor"
mv "${INSTALL_TMPDIR}/.meteor" "$HOME"
rmdir "${INSTALL_TMPDIR}"
# just double-checking :)
test -x "$HOME/.meteor/meteor"
"$HOME/.meteor/meteor" help

echo
echo "A Meteor packaging release has been installed in ~/.meteor."
echo
echo "Run it with ~/.meteor/meteor"
