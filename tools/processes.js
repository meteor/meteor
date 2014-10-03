var Future = require('fibers/future');
var _ = require('underscore');
var child_process = require('child_process');
var Console = require('./console.js').Console;

var processes = exports;

var RunCommand = function (command, args, options) {
  var self = this;

  var defaultOptions = {};
  // Make stdin,stdout & stderr pipes (not shared)
  defaultOptions.stdio = ['pipe', 'pipe', 'pipe'];
  defaultOptions.env = process.env;
  defaultOptions.checkExitCode = true;

  options = _.extend(defaultOptions, options);

  self.command = command;
  self.args = args;
  self.options = options;

  self.exitFuture = new Future();
  self.exitCode = undefined;

  self.stdout = '';
  self.stderr = '';
};

_.extend(RunCommand.prototype, {
  start: function () {
    var self = this;
    if (self.process) {
      throw new Error("Process already started");
    }
    Console.debug("Running command", self.command, self.args.join(' '));
    self.process = child_process.spawn( self.command,
      self.args,
      self.options);
    self.process.on('close', function (exitCode) {
      self.exitCode = exitCode;

      if (options.checkExitCode && exitCode != 0) {
        console.log("Unexpected exit code", exitCode, "from", self.command, self.args, "\nstdout:\n", self.stdout, "\nstderr:\n", self.stderr);
      }

      self.exitFuture.isResolved() || self.exitFuture['return'](exitCode);
    });

    self.process.on('error', function (err) {
      self.exitError = err;
      self.exitFuture.isResolved() || self.exitFuture['throw'](err);
    });

    self.process.stdout.on('data', function (data) {
      self.stdout = self.stdout + data;
    });

    self.process.stderr.on('data', function (data) {
      self.stderr = self.stderr + data;
    });

    self.stdin = self.process.stdin;

    if (self.options.stdin) {
      self.stdin.write(self.options.stdin);
    }

    if (self.options.detached) {
      self.process.unref();
    }
  },

  waitForExit: function () {
    var self = this;
    return self.exitFuture.wait();
  },

  kill: function () {
    var self = this;
    self.process.kill();
  },

  run: function () {
    var self = this;

    self.start();
    self.waitForExit();

    return { stdout: self.stdout, stderr: self.stderr, exitCode: self.exitCode };
  }
});

exports.RunCommand = RunCommand;

