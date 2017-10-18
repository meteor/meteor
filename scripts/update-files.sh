#!/usr/bin/env bash

cd $(dirname $0)/..
mkdir files
cd files
npm pack https://github.com/meteor/readable-stream
