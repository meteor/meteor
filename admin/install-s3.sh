#!/bin/sh

## NOTE sh NOT bash. This script should be POSIX sh only, since we don't
## know what shell the user has. Debian uses 'dash' for 'sh', for
## example.

URLBASE="http://d3sqy0vbqsdhku.cloudfront.net"
VERSION="0.1.4"
PKGVERSION="${VERSION}-1"

UNAME=`uname`
if [ "$UNAME" != "Linux" -a "$UNAME" != "Darwin" ] ; then
    echo "Sorry, this OS is not supported yet."
    exit 1
fi

set -e
trap "echo Installation failed." EXIT

if [ "$UNAME" = "Darwin" ] ; then
    ### OSX ###

    if [ "i386" != `uname -p` -o "1" != `sysctl -n hw.cpu64bit_capable 2>/dev/null || echo 0` ] ; then

        # Can't just test uname -m = x86_64, because Snow Leopard can
        # return other values.
        echo "Only 64-bit Intel processors are supported at this time."
        exit 1
    fi
    ARCH="x86_64"


    URL="$URLBASE/meteor-package-$UNAME-$ARCH-$VERSION.tar.gz"
    TARGET="/usr/local/meteor"
    PARENT="/usr/local"


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


elif [ "$UNAME" = "Linux" ] ; then
    ### Linux ###
    ARCH=`uname -m`
    if [ "$ARCH" != "i686" -a "$ARCH" != "x86_64" ] ; then
        echo "Unsupported architecture: $ARCH"
        echo "Meteor only supports i686 and x86_64 for now."
        exit 1
    fi

    download_url() {
        if [ -x "/usr/bin/curl" ] ; then
            /usr/bin/curl -# -O $1
        elif [ -x "/usr/bin/wget" ] ; then
            /usr/bin/wget -q $1
        else
            echo "Can't find wget or curl."
            exit 1
        fi
    }

    do_with_root() {
        # already have root. just do it.
        if [ `whoami` = 'root' ] ; then
            $*
        elif [ -x /bin/sudo -o -x /usr/bin/sudo ] ; then
            echo "Root access required. Trying sudo. This may prompt for a password."
            echo "sudo $*"
            sudo $*
        else
            echo "Root access required. Please re-run this script as root."
            exit 1
        fi
    }


    TMPDIR=`mktemp -d -t meteor-install-XXXXXXX`
    cd "$TMPDIR"

    if [ -f "/etc/debian_version" ] ; then
        ## Debian
        echo "... detected Debian. downloading .deb"
        if [ "$ARCH" = "i686" ] ; then
            DEBARCH="i386"
        elif [ "$ARCH" = "x86_64" ] ; then
            DEBARCH="amd64"
        fi

        FILE="meteor_${PKGVERSION}_${DEBARCH}.deb"
        URL="$URLBASE/$FILE"
        download_url $URL
        if [ ! -f "$FILE" ] ; then
            echo "Download failed."
            exit 1
        fi
        echo "... installing .deb"
        do_with_root dpkg -i "$FILE"


    elif [ -f /etc/redhat_version -o -x /bin/rpm ] ; then
        ## Redhat
        echo "... detected RedHat. downloading .rpm"
        if [ "$ARCH" = "i686" ] ; then
            RPMARCH="i386"
        else
            RPMARCH="$ARCH"
        fi

        FILE="meteor-${PKGVERSION}.${RPMARCH}.rpm"
        URL="$URLBASE/$FILE"
        download_url $URL
        if [ ! -f "$FILE" ] ; then
            echo "Download failed."
            exit 1
        fi
        echo "... installing .rpm"
        do_with_root rpm -Uvh --replacepkgs "$FILE"

    else
        echo "Unsupported Linux distribution."
        exit 1
    fi

    cd .. # get out of TMPDIR before we remove it.
    rm -rf "$TMPDIR"

fi


cat <<EOF

Meteor installed! To get started fast:

  $ meteor create ~/my_cool_app
  $ cd ~/my_cool_app
  $ meteor

Or see the docs at:

  preview.meteor.com

EOF


trap - EXIT
