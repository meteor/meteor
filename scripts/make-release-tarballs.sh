#!/usr/bin/env bash
set -euo pipefail

# Everything lives inside main(), invoked on the last line: this script
# git-resets the very checkout it runs from, and bash reads script files
# lazily — without the wrapper, rewriting the file mid-run can corrupt
# the running script.
main() {
  for ARGUMENT in "$@"; do
    KEY=$(echo "$ARGUMENT" | cut -f1 -d=)

    KEY_LENGTH=${#KEY}
    VALUE="${ARGUMENT:$KEY_LENGTH+1}"

    export "$KEY"="$VALUE"
  done

  : "${BRANCH_NAME:?BRANCH_NAME is required (BRANCH_NAME=release-X.Y.Z)}"
  : "${VERSION:?VERSION is required (VERSION=X.Y.Z)}"

  echo "BRANCH_NAME = $BRANCH_NAME"
  echo "VERSION = $VERSION"

  git fetch origin
  git checkout release/METEOR@"$VERSION"
  git reset --hard origin/"$BRANCH_NAME"
  git clean -df

  S3_BASE="s3://com.meteor.static/packages-bootstrap/$VERSION"
  HTTP_BASE="https://static.meteor.com/packages-bootstrap/$VERSION"

  build_and_upload os.windows.x86_64 win64
  build_and_upload os.linux.x86_64 linux64
  build_and_upload os.linux.aarch64 linux64
  build_and_upload os.osx.x86_64 osx
  build_and_upload os.osx.arm64 osx

  aws s3 ls "$S3_BASE/"

  echo "Verifying published tarballs..."
  local failed=0 arch code
  for arch in os.windows.x86_64 os.linux.x86_64 os.linux.aarch64 os.osx.x86_64 os.osx.arm64; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$HTTP_BASE/meteor-bootstrap-$arch.tar.gz")
    echo "  $arch -> HTTP $code"
    if [ "$code" != "200" ]; then
      failed=1
    fi
  done

  if [ "$failed" != "0" ]; then
    echo "ERROR: one or more bootstrap tarballs are missing for $VERSION." >&2
    exit 1
  fi
  echo "All bootstrap tarballs for $VERSION are available."
}

# Builds and uploads the tarball for one architecture, retrying to ride out
# transient warehouse errors (e.g. a 502 while downloading a package build).
build_and_upload() {
  local arch="$1" dir="$2" attempt
  for attempt in 1 2 3; do
    if ./meteor admin make-bootstrap-tarballs --target-arch "$arch" "$VERSION" "$dir" &&
        aws s3 cp --acl public-read "$dir/meteor-bootstrap-$arch.tar.gz" "$S3_BASE/"; then
      return 0
    fi
    echo "Attempt $attempt/3 failed for $arch; retrying in 30s..." >&2
    sleep 30
  done
  echo "ERROR: could not build and upload the bootstrap tarball for $arch." >&2
  return 1
}

main "$@"
