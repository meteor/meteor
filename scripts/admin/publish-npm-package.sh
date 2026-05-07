#!/usr/bin/env bash
#
# Publishes an npm-packages/<name> to the registry under the right dist-tag.
#
# Usage:
#   publish-npm-package.sh <package> [--alpha|--beta|--rc]
#
# Without a prerelease flag, publishes under the default 'latest' tag.
# Pairs with bump-npm-package.js: bump first, then publish.
#
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $(basename "$0") <package> [--alpha|--beta|--rc]"
  exit 1
fi

PKG="$1"
shift

TAG="latest"
for arg in "$@"; do
  case "$arg" in
    --alpha) TAG="alpha" ;;
    --beta)  TAG="beta"  ;;
    --rc)    TAG="rc"    ;;
    *) echo "Warning: unknown arg '$arg' (forwarding to npm publish anyway)" ;;
  esac
done

PKG_DIR="$(cd "$(dirname "$0")/../../npm-packages/$PKG" && pwd)"
echo "==> Publishing $PKG from $PKG_DIR with --tag $TAG"
cd "$PKG_DIR"
npm publish --tag "$TAG"
