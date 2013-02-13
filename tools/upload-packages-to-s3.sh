#!/bin/bash

cd ../packages
rm -rf __tmp
mkdir __tmp

for package in `ls`
do
  if [ -a "$package/package.js" ]; then
    version="0.0.1"
    cd $package
    tar -c --exclude=".npm/*" -z -f ../__tmp/$package-$version.tar.gz .
    cd ..
    s3cmd put -P __tmp/$package-$version.tar.gz s3://com.meteor.packages/packages/$package/$package-$version.tar.gz
  fi
done

rm -rf __tmp
