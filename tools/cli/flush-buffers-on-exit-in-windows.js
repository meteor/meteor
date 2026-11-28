// On Windows, writes to process.stdout and process.stderr can be asynchronous
// (e.g. when they are TTYs), so output that is still pending when
// `process.exit` is called may be lost. Node does not flush these streams on
// `process.exit` by design, so we keep this workaround, which waits for them
// to drain before exiting. See "A note on process I/O" in the Node.js
// `process` documentation, and https://github.com/joyent/node/issues/3584 for
// the original report.
if (process.platform === "win32") {
  require('../../packages/meteor/flush-buffers-on-exit-in-windows.js');
}
