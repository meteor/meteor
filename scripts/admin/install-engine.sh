#!/bin/sh

# This is the Meteor install script!
# Are you looking at this in your web browser, and would like to install Meteor?
# Just open up your terminal and type:
#
#    curl https://install.meteor.com/ | sh
#
# Meteor currently supports:
#   - Mac: OS X 10.6 and above
#   - Linux: x86 and x86_64 systems



# Now, on to the actual installer!

## NOTE sh NOT bash. This script should be POSIX sh only, since we don't
## know what shell the user has. Debian uses 'dash' for 'sh', for
## example.

# Is Meteor already installed (in /usr/local/bin (engine) or /usr/bin
# (pre-engine)? If so, just run the updater instead of starting from
# scratch. (This means that if you have pre-engine installed and run this curl
# install script instead of "meteor update", the existing install will be
# cleaned up.)

if [ -x /usr/local/bin/meteor ]; then
  exec /usr/local/bin/meteor update
fi

if [ -x /usr/bin/meteor ]; then
  exec /usr/bin/meteor update
fi

PREFIX="/usr/local"

set -e
set -u

# Let's display everything on stderr.
exec 1>&2

UNAME=$(uname)
if [ "$UNAME" != "Linux" -a "$UNAME" != "Darwin" ] ; then
    echo "Sorry, this OS is not supported yet."
    exit 1
fi


if [ "$UNAME" = "Darwin" ] ; then
  ### OSX ###
  if [ "i386" != "$(uname -p)" -o "1" != "$(sysctl -n hw.cpu64bit_capable 2>/dev/null || echo 0)" ] ; then
    # Can't just test uname -m = x86_64, because Snow Leopard can
    # return other values.
    echo "Only 64-bit Intel processors are supported at this time."
    exit 1
  fi
  ARCH="x86_64"
elif [ "$UNAME" = "Linux" ] ; then
  ### Linux ###
  ARCH=$(uname -m)
  if [ "$ARCH" != "i686" -a "$ARCH" != "x86_64" ] ; then
    echo "Unusable architecture: $ARCH"
    echo "Meteor only supports i686 and x86_64 for now."
    exit 1
  fi
fi
PLATFORM="${UNAME}_${ARCH}"

trap "echo Installation failed." EXIT

# If you already have a warehouse (but don't have meteor in PATH), we do a clean
# install here:
[ -e "$HOME/.meteor" ] && rm -rf "$HOME/.meteor"

TARBALL_URL="https://warehouse.meteor.com/bootstrap/__RELEASE__/meteor-bootstrap-${PLATFORM}.tar.gz"

INSTALL_TMPDIR="$HOME/.meteor-install-tmp"
rm -rf "$INSTALL_TMPDIR"
mkdir "$INSTALL_TMPDIR"
echo "Downloading Meteor distribution"
curl --progress-bar --fail "$TARBALL_URL" | tar -xzf - -C "$INSTALL_TMPDIR"
# bomb out if it didn't work, eg no net
test -x "${INSTALL_TMPDIR}/.meteor/meteor"
mv "${INSTALL_TMPDIR}/.meteor" "$HOME"
rmdir "${INSTALL_TMPDIR}"
# just double-checking :)
test -x "$HOME/.meteor/meteor"
"$HOME/.meteor/meteor" --get-ready

echo
echo "Meteor __RELEASE__ has been installed in your home directory (~/.meteor)."

LAUNCHER="$HOME/.meteor/tools/latest/launch-meteor"

if cp "$LAUNCHER" "$PREFIX/bin/meteor" >/dev/null 2>&1; then
  echo "Writing a launcher script to $PREFIX/bin/meteor for your convenience."
  cat <<"EOF"

To get started fast:

  $ meteor create ~/my_cool_app
  $ cd ~/my_cool_app
  $ meteor

Or see the docs at:

  docs.meteor.com

EOF
elif type sudo >/dev/null 2>&1; then
  echo "Writing a launcher script to $PREFIX/bin/meteor for your convenience."
  echo "This may prompt for your password."

  # New macs (10.9+) don't ship with /usr/local, however it is still in
  # the default PATH. We still install there, we just need to create the
  # directory first.
  if [ ! -d "$PREFIX/bin" ] ; then
      sudo mkdir -m 755 "$PREFIX" || true
      sudo mkdir -m 755 "$PREFIX/bin" || true
  fi

  if sudo cp "$LAUNCHER" "$PREFIX/bin/meteor"; then
    cat <<"EOF"

To get started fast:

  $ meteor create ~/my_cool_app
  $ cd ~/my_cool_app
  $ meteor

Or see the docs at:

  docs.meteor.com

EOF
  else
    cat <<"EOF"

Couldn't write the launcher script. Please either:

  (1) Run the following as root:
        cp ~/.meteor/tools/latest/launch-meteor /usr/bin/meteor
  (2) Add ~/.meteor to your path, or
  (3) Rerun this command to try again.

Then to get started, take a look at 'meteor --help' or see the docs at
docs.meteor.com.
EOF
  fi
else
  cat <<"EOF"

Now you need to do one of the following:

  (1) Add ~/.meteor to your path, or
  (2) Run this command as root:
        cp ~/.meteor/tools/latest/launch-meteor /usr/bin/meteor

Then to get started, take a look at 'meteor --help' or see the docs at
docs.meteor.com.
EOF
fi


trap - EXIT
