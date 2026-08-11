#!/usr/bin/env bash

for ARGUMENT in "$@"; do
  KEY=$(echo $ARGUMENT | cut -f1 -d=)

  KEY_LENGTH=${#KEY}
  VALUE="${ARGUMENT:$KEY_LENGTH+1}"

  export "$KEY"="$VALUE"
done

echo "BRANCH_NAME = $BRANCH_NAME"
echo "VERSION = $VERSION"

git fetch origin
git checkout release/METEOR@"$VERSION"
git reset --hard origin/"$BRANCH_NAME"
git clean -df

./meteor admin make-bootstrap-tarballs --target-arch os.windows.x86_64 "$VERSION" win64 &&
  aws s3 cp --acl public-read win64/meteor-bootstrap-os.windows.x86_64.tar.gz s3://com.meteor.static/packages-bootstrap/"$VERSION"/ &&
  ./meteor admin make-bootstrap-tarballs --target-arch os.linux.x86_64 "$VERSION" linux64 &&
  aws s3 cp --acl public-read linux64/meteor-bootstrap-os.linux.x86_64.tar.gz s3://com.meteor.static/packages-bootstrap/"$VERSION"/ &&
  ./meteor admin make-bootstrap-tarballs --target-arch os.linux.aarch64 "$VERSION" linux64 &&
  aws s3 cp --acl public-read linux64/meteor-bootstrap-os.linux.aarch64.tar.gz s3://com.meteor.static/packages-bootstrap/"$VERSION"/ &&
  ./meteor admin make-bootstrap-tarballs --target-arch os.osx.x86_64 "$VERSION" osx &&
  aws s3 cp --acl public-read osx/meteor-bootstrap-os.osx.x86_64.tar.gz s3://com.meteor.static/packages-bootstrap/"$VERSION"/ &&
  ./meteor admin make-bootstrap-tarballs --target-arch os.osx.arm64 "$VERSION" osx &&
  aws s3 cp --acl public-read osx/meteor-bootstrap-os.osx.arm64.tar.gz s3://com.meteor.static/packages-bootstrap/"$VERSION"/ &&
  aws s3 mb s3://com.meteor.static/packages-bootstrap/"$VERSION"/ &&
  aws s3 ls s3://com.meteor.static/packages-bootstrap/"$VERSION"

# --- Trigger release notifications ---------------------------------------
# Once every platform tarball is live on S3 the release is actually
# installable, so trigger the Release Notifications workflow on the
# release-bot repo. We verify S3 directly (rather than trusting the exit
# status of the chain above) because that chain can report success even
# when an intermediate `aws s3` step short-circuited.
echo "Verifying bootstrap tarballs on S3..."
ALL_TARBALLS_LIVE=true
for PLATFORM in os.windows.x86_64 os.linux.x86_64 os.linux.aarch64 os.osx.x86_64 os.osx.arm64; do
  HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' \
    "https://static.meteor.com/packages-bootstrap/${VERSION}/meteor-bootstrap-${PLATFORM}.tar.gz")
  echo "  ${PLATFORM} -> ${HTTP_CODE}"
  [ "$HTTP_CODE" = "200" ] || ALL_TARBALLS_LIVE=false
done

if [ "$ALL_TARBALLS_LIVE" != true ]; then
  echo "Not all bootstrap tarballs are live; skipping release notifications."
  exit 0
fi

if [ -z "${RELEASE_BOT_DISPATCH_TOKEN:-}" ]; then
  echo "RELEASE_BOT_DISPATCH_TOKEN is not set; cannot trigger release notifications." >&2
  exit 0
fi

echo "All bootstrap tarballs are live; triggering release notifications for ${BRANCH_NAME}."
curl -sf -X POST \
  -H "Authorization: Bearer ${RELEASE_BOT_DISPATCH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/meteor-private/meteor-release-bot/actions/workflows/release-notifications.yml/dispatches" \
  -d "$(printf '{"ref":"main","inputs":{"branch_name":"%s"}}' "$BRANCH_NAME")"
