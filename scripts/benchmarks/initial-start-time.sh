#! /bin/sh

checkout_dir="$(dirname $0)/../../"
cd $checkout_dir
checkout_dir=$(pwd)

./meteor --get-ready
