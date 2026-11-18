// This file can be evaluated more than once in the same process (it is
// required by the command-line tool and also added to the meteor package),
// so only wrap process.exit once. Wrapping it twice would make the outer
// wrapper replace stream.write with a no-op before the inner wrapper writes
// to wait for the drain, so the inner callback would never run and the
// process would hang instead of exiting.
if (process.platform === "win32" &&
    ! process.exit._meteorFlushesBuffersOnExit) {
  /*
   * Based on https://github.com/cowboy/node-exit
   *
   * Copyright (c) 2013 "Cowboy" Ben Alman
   * Licensed under the MIT license.
   */
  var origProcessExit = process.exit.bind(process);
  process.exit = function (exitCode) {
    var streams = [process.stdout, process.stderr];
    var drainCount = 0;
    // Actually exit if all streams are drained.
    function tryToExit() {
      if (drainCount === streams.length) {
        origProcessExit(exitCode);
      }
    }
    streams.forEach(function(stream) {
      // Count drained streams now, but monitor non-drained streams.
      if (stream.bufferSize === 0) {
        drainCount++;
      } else {
        stream.write('', 'utf-8', function() {
          drainCount++;
          tryToExit();
        });
      }
      // Prevent further writing.
      stream.write = function() {};
    });
    // If all streams were already drained, exit now.
    tryToExit();
    // In Windows, when run as a Node.js child process, a script utilizing
    // this library might just exit with a 0 exit code, regardless. This code,
    // despite the fact that it looks a bit crazy, appears to fix that.
    process.on('exit', function() {
      origProcessExit(exitCode);
    });
  };
  process.exit._meteorFlushesBuffersOnExit = true;
}