// Increase libuv thread pool for async I/O parallelism (default: 4).
// Must be set before any async I/O operations. Helps on Linux/macOS
// where filesystem operations can truly run in parallel.
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = '64';
}

// Enable Node.js compile cache (Node 22.8+) for automatic V8 bytecode
// caching of all require() calls. This must be called before any other
// requires to maximize cache coverage.
try {
  const mod = require('module');
  if (typeof mod.enableCompileCache === 'function') {
    mod.enableCompileCache();
  }
} catch (_) {}

const { getChildProcess } = require("./cli/dev-bundle-bin-commands");

getChildProcess({ isFirstTry: true }).then(
  (child) => {
    if (!child) {
      // Use process.nextTick here to prevent the Promise from swallowing
      // errors from the rest of the setup code.
      process.nextTick(continueSetup);
    }
    // If we spawned a process to handle a dev_bundle/bin command like
    // `meteor npm` or `meteor node`, then don't run any other tool code.
  },
  (error) => {
    process.nextTick(function () {
      throw error;
    });
  }
);

function continueSetup() {
  // Set up the Babel transpiler
  require("./tool-env/install-babel");
  // Run the Meteor command line tool
  require("./cli/main");
}
