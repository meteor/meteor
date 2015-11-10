#!/usr/bin/env bash

ORIGDIR=$(pwd)
cd $(dirname $0)
cd ..
TOPDIR=$(pwd)

# download dev bundle if we don't have it already
if [ ! -d dev_bundle ] ; then
    ./meteor --get-ready
fi

cd "$ORIGDIR"
export NODE_PATH="$TOPDIR/dev_bundle/lib/node_modules"

if [ "$EMACS" == t ]; then
    # Emacs shell doesn't need readline and interprets the ANSI characters as
    # garbage.
    export NODE_NO_READLINE=1
fi

"$TOPDIR/dev_bundle/bin/node" "$@"
EXITSTATUS=$?

# Node sets stdin to non-blocking, which causes Emacs shell to die after it
# exits. Work around this by setting stdin to blocking again.
if [ "$EMACS" == t ]; then
    perl -MFcntl=F_GETFL,F_SETFL,O_NONBLOCK -e \
        'fcntl(STDIN, F_SETFL, ~O_NONBLOCK & fcntl(STDIN, F_GETFL, 0))'
fi

exit $EXITSTATUS
