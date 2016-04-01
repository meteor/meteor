var spawnBinProcess = require('./cli/dev-bundle-bin-commands.js').process
if (spawnBinProcess) {
  // On Node 0.10 on Windows, stdout and stderr don't get flushed when calling
  // `process.exit`. We use a workaround for now, but this should be fixed on
  // Node 0.12, so when we upgrade let's remember to remove this clause, and the
  // file it requires. See https://github.com/joyent/node/issues/3584
  // This same comment and require is in ./cli/main.js
  if (process.platform === 'win32') {
    require('./tool-env/flush-buffers-on-exit-in-windows.js');
  }

  spawnBinProcess.on('exit', function (exitCode) {
    process.exit(exitCode);
  });
} else {
  // Set up the Babel transpiler
  require('./tool-env/install-babel.js');

  // Run the Meteor command line tool
  require('./cli/main.js');
}
