#!/bin/bash

## Creates a self-contained spark.js and writes it stdout.

set -e

PACKAGES_DIR=`dirname $0`/../../packages

echo 'Meteor = {};'
cat $PACKAGES_DIR/underscore/underscore.js
cat $PACKAGES_DIR/logging/logging.js
cat $PACKAGES_DIR/random/random.js
cat $PACKAGES_DIR/deps/deps.js
cat $PACKAGES_DIR/deps/deps-utils.js
cat $PACKAGES_DIR/liverange/liverange.js
cat $PACKAGES_DIR/universal-events/listener.js
cat $PACKAGES_DIR/universal-events/events-ie.js
cat $PACKAGES_DIR/universal-events/events-w3c.js
cat $PACKAGES_DIR/domutils/domutils.js
cat $PACKAGES_DIR/ordered-dict/ordered_dict.js
cat $PACKAGES_DIR/spark/spark.js
cat $PACKAGES_DIR/spark/patch.js
