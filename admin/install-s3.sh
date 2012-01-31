#!/bin/bash

URL="http://d3sqy0vbqsdhku.cloudfront.net/meteor-package-0.1.2.tar.gz"
TARGET="/usr/local/meteor"
PARENT="/usr/local"

# Check for MacOS
if [ `uname` != "Darwin" ] ; then
    echo "Sorry, Meteor only supports MacOS X right now."
    exit 1
fi

set -e
trap "echo Installation failed." EXIT

if [ -e "$TARGET" ] ; then
    echo "Updating Meteor in $TARGET"
else
    echo "Installing Meteor to $TARGET"
fi

# if /usr/local doesn't exist or isn't writable, fix it with sudo.
if [ ! -d "$PARENT" ] ; then
    echo
    echo "$PARENT does not exist. Creating it with 'sudo mkdir'."
    echo "This may prompt for your password."
    echo
    sudo /bin/mkdir "$PARENT"
    sudo /usr/bin/chgrp admin "$PARENT"
    sudo /bin/chmod 775 "$PARENT"
elif [ ! -w "$PARENT" -o ! -w "$PARENT/bin" ] ; then
    echo
    echo "The install script needs to change the permissions on $PARENT so that"
    echo "administrators can write to it. This may prompt for your password."
    echo
    sudo /usr/bin/chgrp admin "$PARENT"
    sudo /bin/chmod g+rwx "$PARENT"
    if [ -d "$PARENT/bin" ] ; then
        sudo /usr/bin/chgrp admin "$PARENT/bin"
        sudo /bin/chmod g+rwx "$PARENT/bin"
    fi
fi

# remove old version
if [ -e "$TARGET" ] ; then
    rm -rf "$TARGET"
fi

# make sure target exists and is directory
mkdir -p "$TARGET" || true
if [ ! -d "$TARGET" -o ! -w "$TARGET" ] ; then
    echo "can't write to $TARGET"
    exit 1
fi

# download and untar
echo "... downloading"
curl --progress-bar $URL | tar -C "$PARENT" -xzf -

# add to $PATH
mkdir -p "$PARENT/bin"
rm -f "$PARENT/bin/meteor"
ln -s "$TARGET/bin/meteor" "$PARENT/bin/meteor"

cat <<EOF

Meteor installed! To get started fast:

  $ meteor create ~/my_cool_app
  $ cd ~/my_cool_app
  $ meteor

Or see the docs at:

  preview.meteor.com

EOF

trap - EXIT
