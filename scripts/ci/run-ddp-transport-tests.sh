#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

# uWS listens separately from the HTTP port chosen by test-in-console. Pick a
# fresh backend port per suite: concurrent jobs share this machine, and the
# preceding suite's Meteor process may still be shutting down.
if [ "${DDP_TRANSPORT:-}" = uws ]; then
  METEOR_SETTINGS=$(node <<'NODE'
const server = require('node:net').createServer();
server.listen(0, '127.0.0.1', () => {
  const settings = { packages: { 'ddp-server': { uws: { port: server.address().port } } } };
  server.close(() => console.log(JSON.stringify(settings)));
});
NODE
  )
  export METEOR_SETTINGS
fi

exec ./packages/test-in-console/run.sh "$@"
