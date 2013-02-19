#!/bin/bash

# generate a hash of the entire contents of a directory. this hash
# depends only on file contents and not, say, modification time. only
# reads files not ignored by git.

# (HACK) ignores packages/ subdirectories relative to the current
# working directory. this is done because engine version should not
# depend on the contents of package directories.

OIFS="$IFS"
IFS=$'\n' # so that `find ...` below works with filenames that have spaces
(
  for f in `git ls-files | grep -v packages/`; do
    echo "$f" `cat "$f" | shasum -a 256`
  done
) \
  | LC_ALL=C sort $(: LC_ALL=C to sort by byte order, independently of locale. ) \
  | shasum -a 256 | cut -f 1 -d " " # shasum's output looks like: 'SHA -'

IFS="$OIFS"
