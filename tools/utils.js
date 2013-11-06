var Fibers = require('fibers');
var Future = require('fibers/future');
var readline = require('readline');
var _ = require('underscore');

// options:
//   - echo (boolean): defaults to true
//   - prompt (string)
exports.readLine = function (options) {
  var fut = new Future();

  options = _.extend({
    echo: true
  }, options);

  var silentStream = {
    write: function () {
    },
    on: function () {
    },
    end: function () {
    },
    isTTY: function () {
      return process.stdout.isTTY();
    },
    removeListener: function () {
    }
  };

  // Read a line, throwing away the echoed characters into our dummy stream.
  var rl = readline.createInterface({
    input: process.stdin,
    output: options.echo ? process.stdout : silentStream
  });

  if (! options.echo) {
    process.stdout.write(options.prompt);
  } else {
    rl.setPrompt(options.prompt);
    rl.prompt();
  }

  rl.on('line', function (line) {
    rl.close();
    fut['return'](line);
  });

  return fut.wait();
};
