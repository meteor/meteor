#!/bin/bash

URL="http://d377jur38fl888.cloudfront.net/skybreak-package-0.0.35.tar.gz"
TARGET="/usr/local/skybreak"
PARENT="/usr/local"

set -e
trap "echo Installation FAILED" INT TERM EXIT

# Check for MacOS
if [ `uname` != "Darwin" ] ; then
    echo "Skybreak only support MacOS X right now."
    exit 1
fi


echo "Installing Skybreak to $TARGET"

# if /usr/local doesn't exist or isn't writable, fix it with sudo.
if [ ! -d "$PARENT" ] ; then
    echo
    echo "'$PARENT' does not exist. creating it."
    echo "This may prompt for your password."
    echo "sudo /bin/mkdir \"$PARENT\""
    sudo /bin/mkdir "$PARENT"
    echo "sudo /usr/bin/chgrp admin \"$PARENT\""
    sudo /usr/bin/chgrp admin "$PARENT"
    echo "sudo /bin/chmod 775 \"$PARENT\""
    sudo /bin/chmod 775 "$PARENT"
elif [ ! -w "$PARENT" -o ! -w "$PARENT/bin" ] ; then
    echo
    echo "'$PARENT' is not writable to you. changing it."
    echo "This may prompt for your password."
    echo "sudo /usr/bin/chgrp -f admin \"$PARENT\" \"$PARENT/bin\""
    sudo /usr/bin/chgrp -f admin "$PARENT" "$PARENT/bin"
    echo "sudo chmod -f g+rwx \"$PARENT\" \"$PARENT/bin\""
    sudo /bin/chmod -f g+rwx "$PARENT" "$PARENT/bin"
fi


# remove old version
if [ -e "$TARGET" ] ; then
    echo "found existing install. removing $TARGET."
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
rm -f "$PARENT/bin/skybreak"
ln -s "$TARGET/bin/skybreak" "$PARENT/bin/skybreak"

cat <<EOF

Skybreak installed!

To get started fast:

skybreak create ~/my_cool_app
cd ~/my_cool_app
skybreak

EOF

trap - INT TERM EXIT
