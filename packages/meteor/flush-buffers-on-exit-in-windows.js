if (process.platform === "win32") {
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
}