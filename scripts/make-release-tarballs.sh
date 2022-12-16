#!/usr/bin/env bash

for ARGUMENT in "$@"; do
  KEY=$(echo $ARGUMENT | cut -f1 -d=)

  KEY_LENGTH=${#KEY}
  VALUE="${ARGUMENT:$KEY_LENGTH+1}"

  export "$KEY"="$VALUE"
done

echo "BRANCH_NAME = $BRANCH_NAME"
echo "VERSION = $VERSION"

git fetch origin && git checkout release/METEOR@"$VERSION" &&
  git reset --hard origin/"$BRANCH_NAME" &&
  git clean -df &&
  ./meteor admin make-bootstrap-tarballs --target-arch os.windows.x86_64 "$VERSION" win64 &&
  aws s3 cp --acl public-read win64/meteor-bootstrap-os.windows.x86_64.tar.gz s3://com.meteor.static/packages-bootstrap/"$VERSION"/ &&
  ./meteor admin make-bootstrap-tarballs --target-arch os.linux.x86_64 "$VERSION" linux64 &&
  aws s3 cp --acl public-read linux64/meteor-bootstrap-os.linux.x86_64.tar.gz s3://com.meteor.static/packages-bootstrap/"$VERSION"/ &&
  ./meteor admin make-bootstrap-tarballs --target-arch os.osx.x86_64 "$VERSION" osx &&
  aws s3 cp --acl public-read osx/meteor-bootstrap-os.osx.x86_64.tar.gz s3://com.meteor.static/packages-bootstrap/"$VERSION"/ &&
  ./meteor admin make-bootstrap-tarballs --target-arch os.osx.arm64 "$VERSION" osx &&
  aws s3 cp --acl public-read osx/meteor-bootstrap-os.osx.arm64.tar.gz s3://com.meteor.static/packages-bootstrap/"$VERSION"/ &&
  aws s3 mb s3://com.meteor.static/packages-bootstrap/"$VERSION"/ &&
  aws s3 ls s3://com.meteor.static/packages-bootstrap/"$VERSION"
