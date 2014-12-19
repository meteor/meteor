#!/bin/bash

export ARG="$1"
curl -s "https://github.com/meteor/meteor/commit/$(git log --format=%H -1 --author "$1")" | perl -nle 'm!<span class="author-name"><a href="/([^"]+)"! and do { my $name = $1; $ENV{ARG} =~ /(<.+>)/; print "GITHUB: $name $1"; exit 0 }'
