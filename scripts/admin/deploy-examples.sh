#!/bin/bash

set -e

cd `dirname $0`
cd ../examples


read -p "Prefix? " PREFIX;

for EXAMPLE in * ; do
    if [ -d "$EXAMPLE/.meteor" ] ; then
        cd $EXAMPLE;
        echo "meteor deploy $@ $PREFIX-$EXAMPLE;"
        meteor deploy $@ $PREFIX-$EXAMPLE;
        cd ..;
    fi
done
