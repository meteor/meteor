#!/usr/bin/env bash
echo "Please run this script from the docs app folder."
echo "Make sure you have phantomjs installed!"

DOCS_FOLDER=$(pwd);
METEOR_FOLDER=$(dirname ${DOCS_FOLDER});

# make temporary folder
mkdir /tmp/docsdiff
cd /tmp/docsdiff

# trigger phantomjs to give us actual HTML
curl "localhost:3000/?_escaped_fragment_=key1=value1" > new
curl "docs.meteor.com/?_escaped_fragment_=key1=value1" > old

# use our handy canonicalize script copy-pasted from the test-helpers package
# maybe there is a way to use the actual package?
${METEOR_FOLDER}/scripts/node.sh "${DOCS_FOLDER}/private/canonicalize.js" new > new1
${METEOR_FOLDER}/scripts/node.sh "${DOCS_FOLDER}/private/canonicalize.js" old > old1

# remove some of the things we want to ignore, you might want to change these
cat new1 | sed "s/new-api-box//g" | sed "s/ class=\"api-title\"//g" > new2
cat new2  | sed "s/<p><\/p>//g" > new3
cat new3  | sed "s/i>/em>/g" > new4

cat old1 | sed "s/new-api-box//g" | sed "s/ class=\"api-title\"//g" > old2
cat old2  | sed "s/<p><\/p>//g" > old3
cat old3  | sed "s/i>/em>/g" > old4

# git diff is more colorful than regular diff
/usr/bin/git diff -U10 --no-index --ignore-blank-lines -w old4 new4