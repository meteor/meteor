// A simple interface to register functions to be called when the process exits.

const exitHandlers = [];

export function onExit(func) {
  exitHandlers.push(func);
}

async function runHandlers() {
  await Promise.all(exitHandlers.splice(0).map(f => f()));
}

process.on('exit', runHandlers);
['SIGINT', 'SIGHUP', 'SIGTERM'].forEach((sig) => {
  process.once(sig, async () => {
    await runHandlers();
    process.kill(process.pid, sig);
  });
});
