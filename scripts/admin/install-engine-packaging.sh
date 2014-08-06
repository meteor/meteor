#!/bin/sh

# This is the Meteor install script, for previews of the in-progress
# Meteor 0.9.0!
#
# Are you looking at this in your web browser, and would like to install Meteor?
# Just open up your terminal and type:
#
#    curl https://install-packaging-preview.meteor.com/ | sh
#
# Although, if you aren't ready for pre-release software, try this instead:
#
#    curl https://install.meteor.com/ | sh
#
# Meteor currently supports:
#   - Mac: OS X 10.6 and above
#   - Linux: x86 and x86_64 systems


RELEASE="0.9.0-preview-final"


# Now, on to the actual installer!

## NOTE sh NOT bash. This script should be POSIX sh only, since we don't
## know what shell the user has. Debian uses 'dash' for 'sh', for
## example.

# XXX Once this is the official script, add back in the 'exec meteor update'
#     part.

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
  PLATFORM="os.osx.x86_64"
elif [ "$UNAME" = "Linux" ] ; then
  ### Linux ###
  LINUX_ARCH=$(uname -m)
  if [ "${LINUX_ARCH}" = "i686" ] ; then
    PLATFORM="os.linux.x86_32"
  elif [ "${LINUX_ARCH}" = "x86_64" ] ; then
    PLATFORM="os.linux.x86_64"
  else
    echo "Unusable architecture: ${LINUX_ARCH}"
    echo "Meteor only supports i686 and x86_64 for now."
    exit 1
  fi
fi

trap "echo Installation failed." EXIT

# If you already have a tropohouse, we do a clean install here:
[ -e "$HOME/.meteor0" ] && rm -rf "$HOME/.meteor0"

TARBALL_URL="https://d3sqy0vbqsdhku.cloudfront.net/packages-preview/${RELEASE}/meteor-bootstrap-${PLATFORM}.tar.gz"

INSTALL_TMPDIR="$HOME/.meteor0-install-tmp"
rm -rf "$INSTALL_TMPDIR"
mkdir "$INSTALL_TMPDIR"
echo "Downloading Meteor pre-release distribution"
curl --progress-bar --fail "$TARBALL_URL" | tar -xzf - -C "$INSTALL_TMPDIR" -o
# bomb out if it didn't work, eg no net
test -x "${INSTALL_TMPDIR}/.meteor0/meteor"
mv "${INSTALL_TMPDIR}/.meteor0" "$HOME"
rmdir "${INSTALL_TMPDIR}"
# just double-checking :)
test -x "$HOME/.meteor0/meteor"
"$HOME/.meteor0/meteor" --get-ready

echo
echo "Meteor ${RELEASE} has been installed in your home directory (~/.meteor0)."
echo
echo "Run the tool from ~/.meteor0/meteor"
echo
echo "You may want to make an alias (a symlink won't work) to it called 'meteor0'"
echo
echo "For example, put this in your ~/.bashrc:"
echo '  alias meteor0=$HOME/.meteor0/meteor'
echo "(A future pre-release will merge this with the 'meteor' you already have.)"


trap - EXIT
