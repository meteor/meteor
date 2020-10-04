// A simple interface to register functions to be called when the process exits.

import { noYieldsAllowed } from "../utils/fiber-helpers.js";

const exitHandlers = [];

export function onExit(func) {
  exitHandlers.push(func);
}

function runHandlers() {
  noYieldsAllowed(() => {
    // Empty and execute all queued exit handlers.
    exitHandlers.splice(0).forEach((f) => {
      f();
    });
  });
}

process.on('exit', runHandlers);
['SIGINT', 'SIGHUP', 'SIGTERM'].forEach((sig) => {
  process.once(sig, () => {
    runHandlers();
    process.kill(process.pid, sig);
  });
});
