#!/bin/sh

PREFIX="/usr/local"

set -e
set -u

# In some contexts (emacs shell?) stdout from this script doesn't display, so
# ensure that everything goes to stderr.
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
    echo "Unable architecture: $ARCH"
    echo "Meteor only supports i686 and x86_64 for now."
    exit 1
  fi
fi
PLATFORM="${UNAME}_${ARCH}"

trap "echo Installation failed." EXIT

# If you already have a warehouse, overwrite it.
[ -e "$HOME/.meteor" ] && rm -rf "$HOME/.meteor"

BOOTSTRAP_URL='https://install-bootstrap.meteor.com/'
ROOT_URL="$(curl -s --fail $BOOTSTRAP_URL)"
TARBALL_URL="${ROOT_URL}/meteor-bootstrap-${PLATFORM}.tar.gz"

INSTALL_TMPDIR="$HOME/.meteor-install-tmp"
rm -rf "$INSTALL_TMPDIR"
mkdir "$INSTALL_TMPDIR"
echo "Downloading Engine upgrade"
curl --progress-bar --fail "$TARBALL_URL" | tar -xzf - -C "$INSTALL_TMPDIR"
# bomb out if it didn't work, eg no net
test -x "${INSTALL_TMPDIR}/.meteor/meteor"
mv "${INSTALL_TMPDIR}/.meteor" "$HOME"
rmdir "${INSTALL_TMPDIR}"
# just double-checking :)
test -x "$HOME/.meteor/meteor"

cat <<"EOF"

Installing Meteor in your home directory (~/.meteor):
 * 'meteor' build tool
 * Package updates: absolute-url accounts-base accounts-facebook
   account-github accounts-google accounts-oauth1-helper accounts-oauth2-helper
   accounts-oauth-helper accounts-password accounts-twitter accounts-ui
   accounts-ui-unstyled accounts-urls account-weibo amplify autopublish
   backbone bootstrap code-prettify coffeescript d3 deps domutils ejson email
   force-ssl handlebars htmljs http insecure jquery jquery-history
   jquery-layout jquery-waypoints json jsparse less livedata liverange
   localstorage-polyfill logging madewith meteor minimongo mongo-livedata
   ordered-dict past preserve-inputs random reload routepolicy session showdown
   spark spiderable srp startup stream stylus templating test-helpers
   test-in-browser tinytest underscore universal-events

EOF

LAUNCHER="$HOME/.meteor/tools/latest/launch-meteor"
LAUNCHER_INSTALLED=0

if cp "$LAUNCHER" "$PREFIX/bin/meteor" >/dev/null 2>&1; then
  echo "Writing a launcher script to $PREFIX/bin/meteor for your convenience."
  LAUNCHER_INSTALLED=1
elif type sudo >/dev/null 2>&1; then
  echo "Writing a launcher script to $PREFIX/bin/meteor for your convenience."
  echo "This may prompt for your password."
  if sudo cp "$LAUNCHER" "$PREFIX/bin/meteor"; then
    LAUNCHER_INSTALLED=1
  fi
fi

if [ "$LAUNCHER_INSTALLED" = "1" ]; then
  if [ "$UNAME" = "Linux" ]; then
    cat <<"EOF"
**************************************************************
*** Meteor is now installed at /usr/local/bin/meteor.      ***
*** Run `hash -r` so that your shell notices it has moved. ***
**************************************************************
EOF
  else
    echo
  fi
else
    cat <<"EOF"

Couldn't write the launcher script. Please either:

  (1) Add ~/.meteor to your path, or
  (2) Run this command as root:
        cp ~/.meteor/tools/latest/launch-meteor /usr/bin/meteor
EOF
fi


trap - EXIT

exec "$HOME/.meteor/meteor" update --dont-fetch-latest
