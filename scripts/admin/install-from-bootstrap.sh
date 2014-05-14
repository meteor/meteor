#!/bin/bash

# XXX update all .meteor0 in this script to .meteor when we get farther along
# transition plan

set -e
set -u

if [ $# -ne 1 ]; then
    echo "usage: install-from-bootstrap.sh meteor-bootstrap.tgz" 1>&2
    exit 1
fi

TARBALL="$1"
INSTALL_TMPDIR="$HOME/.meteor-install-tmp"

# Overwrite existing tropohouse.
[ -e "$HOME/.meteor0" ] && rm -rf "$HOME/.meteor0"


rm -rf "${INSTALL_TMPDIR}"
mkdir "${INSTALL_TMPDIR}"
tar -xzf "$TARBALL" -C "${INSTALL_TMPDIR}"

# bomb out if it didn't work
test -x "${INSTALL_TMPDIR}/.meteor0/meteor"
mv "${INSTALL_TMPDIR}/.meteor0" "$HOME"
rmdir "${INSTALL_TMPDIR}"
# just double-checking :)
test -x "$HOME/.meteor0/meteor"
"$HOME/.meteor0/meteor" help

echo
echo "A Meteor packaging prelease has been installed in ~/.meteor0."
echo
echo "Run it with ~/.meteor0/meteor"
