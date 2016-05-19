#! /bin/sh

set -e

checkout_dir="$(dirname $0)/../../"
cd $checkout_dir
checkout_dir=$(pwd)

app_dir=`mktemp -d /tmp/meteor-bench-app.XXXX`

cd $app_dir
$checkout_dir/meteor create --example todos . > /dev/null

# Add a file to the app that shuts it down immediately
echo "Meteor.startup(function(){process.exit(0)});" > "exit.js"

# Run once to build all of the packages
$checkout_dir/meteor --once &> /dev/null

for i in `seq 10`; do
  # Run again to time
  /usr/bin/time -p $checkout_dir/meteor --once 1> /dev/null 2> out

  BENCHMARK_OUTPUT=`cat out`

  # Get first line
  BENCHMARK_OUTPUT=$(echo "$BENCHMARK_OUTPUT" | head -n 1)
  ARRAY=($BENCHMARK_OUTPUT)
  NUMBER=${ARRAY[1]}

  # Print output
  echo $NUMBER
done

cd $checkout_dir

# XXX are we going to rm -rf our whole disk by accident here?
rm -rf "$app_dir"
