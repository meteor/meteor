#!/bin/sh

set -e
set -u
set -o pipefail

echo "Fetching the latest Meteor installer."

INSTALL_SCRIPT_URL="https://packages.meteor.com/install.sh"

if [ -n "${METEOR_RED_PILL_RELEASE:-}" ]; then
  INSTALL_SCRIPT_URL="${INSTALL_SCRIPT_URL}?release=${METEOR_RED_PILL_RELEASE}"
fi

curl -s --fail "$INSTALL_SCRIPT_URL" | sh
