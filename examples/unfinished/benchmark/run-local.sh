#!/bin/bash

PORT=9000
NUM_CLIENTS=10
DURATION=120
REPORT_INTERVAL=10

set -e
trap 'echo "FAILED. Killing: $(jobs -pr)" ; for pid in "$(jobs -pr)"; do kill $pid ; done' EXIT

PROJDIR=`dirname $0`
cd "$PROJDIR"
PROJDIR=`pwd`

SCENARIO="${1:-default}"

# clean up from previous runs
# XXX this is gross!
pkill -f "$PROJDIR/.meteor/local/db" || true
../../../meteor reset || true

# start the benchmark app
../../../meteor --production --settings "scenarios/${SCENARIO}.json" --port 9000 &
OUTER_PID=$!

echo "Waiting for server to come up"
function wait_for_port {
    local N=0
    while ! curl -v "$1" 2>&1 | grep ' 200 ' > /dev/null ; do
        sleep 1
        N=$(($N+1))
        if [ $N -ge $2 ] ; then
            echo "Timed out waiting for port $1"
            exit 2
        fi
    done
}
wait_for_port "http://localhost:9001" 60


echo "Starting phantoms"
# start a bunch of phantomjs processes
PHANTOMSCRIPT=`mktemp -t benchmark-XXXXXXXX`
cat > "$PHANTOMSCRIPT" <<EOF
var page = require('webpage').create();
var url = 'http://localhost:$PORT';
page.open(url);
EOF
for ((i = 0 ; i < $NUM_CLIENTS ; i++)) ; do
    # sleep between each phantom start both to provide a smoother ramp
    # to the benchmark and because otherwise their PRNGs get set to the
    # same seed and you get duplicate key errors!
    sleep 2
    phantomjs "$PHANTOMSCRIPT" &
done

ps -o cputime,ppid,args | grep " $OUTER_PID " | grep main.js || true
for ((i = 0 ; i < $DURATION/$REPORT_INTERVAL ; i++)) ; do
    sleep $REPORT_INTERVAL
    ps -o cputime,ppid,args | grep " $OUTER_PID " | grep main.js || true
done

# print totals of all processes (outer, mongo, inner)
echo
echo TOTALS
ps -o cputime,pid,ppid,args | grep " $OUTER_PID " | grep -v grep || true


# cleanup
trap - EXIT
for pid in "$(jobs -pr)"; do
    # not sure why we need both, but it seems to help clean up rogue
    # mongo and phantomjs processes.
    kill -INT $pid
    kill $pid
done
rm "$PHANTOMSCRIPT"


