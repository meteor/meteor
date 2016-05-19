// On Node 0.10 on Windows, stdout and stderr don't get flushed when calling
// `process.exit`. We use a workaround for now, but this should be fixed on
// Node 0.12, so when we upgrade let's remember to remove this clause, and the
// file it requires. See https://github.com/joyent/node/issues/3584
if (process.platform === "win32") {
  require('../../packages/meteor/flush-buffers-on-exit-in-windows.js');
}
