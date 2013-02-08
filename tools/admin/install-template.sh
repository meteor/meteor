#!/bin/sh

## NOTE sh NOT bash. This script should be POSIX sh only, since we don't
## know what shell the user has. Debian uses 'dash' for 'sh', for
## example.

PREFIX="/usr/local"

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

  # if /usr/local doesn't exist or isn't writable, fix it with sudo.
  if [ ! -d "$PREFIX" ] ; then
      echo
      echo "$PREFIX does not exist. Creating it with 'sudo mkdir'."
      echo "This may prompt for your password."
      echo
      sudo /bin/mkdir "$PREFIX"
      sudo /usr/bin/chgrp admin "$PREFIX"
      sudo /bin/chmod 775 "$PREFIX"
  elif [ ! -w "$PREFIX" -o ! -w "$PREFIX/bin" ] ; then
      echo
      echo "The install script needs to change the permissions on $PREFIX so that"
      echo "administrators can write to it. This may prompt for your password."
      echo
      sudo /usr/bin/chgrp admin "$PREFIX"
      sudo /bin/chmod g+rwx "$PREFIX"
      if [ -d "$PREFIX/bin" ] ; then
          sudo /usr/bin/chgrp admin "$PREFIX/bin"
          sudo /bin/chmod g+rwx "$PREFIX/bin"
      fi
  fi

elif [ "$UNAME" = "Linux" ] ; then
  ### Linux ###
  ARCH=`uname -m`
  if [ "$ARCH" != "i686" -a "$ARCH" != "x86_64" ] ; then
    echo "Unable to install Meteor on unsupported architecture: $ARCH"
    exit 1
  fi
fi

do_with_root() {
  # already have root. just do it.
  if [ `whoami` = 'root' ] ; then
    "$@"
  elif [ -x /bin/sudo -o -x /usr/bin/sudo ] ; then
    echo
    echo "Since this system includes sudo, Meteor will request root privileges to"
    echo "install. You may be prompted for a password. If you prefer to not use"
    echo "sudo, please re-run this script as root."
    echo "  sudo $*"
    sudo "$@"
  else
    echo "Meteor requires root privileges to install. Please re-run this script as"
    echo "root."
    exit 1
  fi
}

TMPDIR=`mktemp -d -t meteor-install-XXXXXXX`
cd "$TMPDIR"

sed 's/^X//' >meteor << 'END-of-meteor-bootstrap'
SHARHERE
END-of-meteor-bootstrap

chmod 755 meteor


echo "Installing Meteor to $PREFIX/bin/meteor"

if [ -e "$PREFIX/bin/meteor" ] ; then
  do_with_root rm -rf "$PREFIX/bin/meteor"
fi

do_with_root mv meteor "$PREFIX/bin/"

cd .. # get out of TMPDIR before we remove it.
rm -rf "$TMPDIR"

echo
echo "Downloading the latest Meteor release"

# XXX this will become 'update' once that works
"$PREFIX/bin/meteor" --version

cat <<EOF



Meteor installed! To get started fast:

  $ meteor create ~/my_cool_app
  $ cd ~/my_cool_app
  $ meteor

Or see the docs at:

  docs.meteor.com

EOF


trap - EXIT
