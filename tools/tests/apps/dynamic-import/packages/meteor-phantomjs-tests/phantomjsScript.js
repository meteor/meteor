var page = require('webpage').create();
var system = require('system');

// Returns a string with ANSII escape characters removed.
// Borrowed from https://www.npmjs.com/package/strip-ansi
function stripAnsi(str) {
  if (str.length === 0) return str;
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

var lastOutput = new Date();
page.onConsoleMessage = function(message) {
  lastOutput = new Date();
  if (typeof message === 'string') {
    // Remove empty "stdout" lines. Not sure where these come from.
    // See https://github.com/DispatchMe/meteor-mocha-phantomjs/issues/30
    if (stripAnsi(message).trim() !== 'stdout:') console.log(message);
    return;
  }
  console.log(message);
};

page.onError = function(msg, trace) {
  var testsAreRunning = page.evaluate(function() {
    return window.testsAreRunning;
  });
  if (testsAreRunning) return;
  console.error(msg);
  trace.forEach(function(item) {
    console.error('    ' + item.file + ': ' + item.line);
  });
  // We could call phantom.exit here, but sometimes there are benign client errors
  // and the tests still load and run fine. So instead there is a safeguard in the
  // setInterval to exit if nothing happens for awhile.
};

page.open(system.env.ROOT_URL);

setInterval(function() {
  var done = page.evaluate(function() {
    return window.testsDone;
  });
  if (done) {
    var failures = page.evaluate(function() {
      return window.testFailures;
    });
    // We pass back the number of failures as the exit code
    return phantom.exit(failures);
  }

  // As a safeguard, we will exit if there hasn't been console output for
  // 30 seconds.
  if ((new Date()) - lastOutput > 30000) {
    phantom.exit(2);
  }
}, 500);
