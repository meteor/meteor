///
/// utility functions for formatting output to the screen
///

var _ = require('underscore');
var Fiber = require('fibers');
var Future = require('fibers/future');
var ProgressBar = require('progress');
var buildmessage = require('./buildmessage.js');
// XXX: Are we happy with chalk (and its sub-dependencies)?
var chalk = require('chalk');

var Console = function (options) {
  var self = this;

  options = options || {};

  self._progressBar = null;
  self._info = null;
};

PROGRESS_BAR_WIDTH = 20;
PROGRESS_BAR_FORMAT = '[:bar] :percent :etas';
STATUS_POSITION = PROGRESS_BAR_WIDTH + 15;

// Message to show when we don't know what we're doing
// XXX: ? FALLBACK_STATUS = 'Pondering';
FALLBACK_STATUS = '';

// This function returns a future which resolves after a timeout. This
// demonstrates manually resolving futures.
function sleep(ms) {
  var future = new Future;
  setTimeout(function() {
    future.return();
  }, ms);
  return future.wait();
};

LEVEL_CODE_ERROR = 4;
LEVEL_CODE_WARN = 3;
LEVEL_CODE_INFO = 2;
LEVEL_CODE_DEBUG = 1;

LEVEL_ERROR = { code: LEVEL_CODE_ERROR };
LEVEL_WARN = { code: LEVEL_CODE_WARN };
LEVEL_INFO = { code: LEVEL_CODE_INFO };
LEVEL_DEBUG = { code: LEVEL_CODE_DEBUG };

_.extend(Console.prototype, {
  hideProgressBar: function () {
    var self = this;

    if (!self._progressBar) {
      return;
    }
    self._progressBar.terminate();
  },

  _renderProgressBar: function () {
    var self = this;
    if (self._progressBar) {
      self._progressBar.render();
      if (self._info) {
        self._progressBar.stream.cursorTo(STATUS_POSITION);
        self._progressBar.stream.write(chalk.bold(' ' + self._info));
      }
    }
  },

  enableStatusPoll: function () {
    var self = this;
    Fiber(function () {
      while (true) {
        var rootProgress = buildmessage.getRootProgress();
        var title = (rootProgress ? rootProgress.getCurrent() : null) || FALLBACK_STATUS;
        //rootProgress.dump(process.stdout);
        //console.log("Job: " + title);
        if (title != self._info) {
          self._info = title;
          self._renderProgressBar();
        }
        sleep(500);
      }
    }).run();
  },

  info: function(/*arguments*/) {
    var self = this;

    var message = self._format(arguments);
    self._print(LEVEL_INFO, message);
  },

  warn: function(/*arguments*/) {
    var self = this;

    var message = self._format(arguments);
    self._print(LEVEL_WARN, message);
  },

  error: function(/*arguments*/) {
    var self = this;

    var message = self._format(arguments);
    self._print(LEVEL_ERROR, message);
  },

  _print: function(level, message) {
    var self = this;

    var progressBar = self._progressBar;
    if (progressBar) {
      progressBar.terminate();
    }

    var dest = process.stdout;
    var style = null;

    if (level) {
      switch (level.code) {
        case LEVEL_CODE_ERROR:
          dest = process.stderr;
          style = chalk.bold.red;
          break;
        case LEVEL_CODE_WARN:
          dest = process.stderr;
          style = chalk.red;
          break;
        case LEVEL_CODE_INFO:
          style = chalk.blue;
          break;
      }
    }

    if (style) {
      dest.write(style(message + '\n'));
    } else {
      dest.write(message + '\n');
    }

    if (progressBar) {
      self._renderProgressBar();
    }
  },

  _format: function (logArguments) {
    var self = this;

    var message = '';
    var format = logArguments[0];
    message = format;
    return message;
  },

  printMessages: function (messages) {
    var self = this;

    if (messages.hasMessages()) {
      self._print(null, "\n" + messages.formatMessages());
    }
  },

  showProgressBar: function () {
    var self = this;

    if (self._progressBar) {
      return;
    }

    var stream = process.stdout;
    if (!stream.isTTY) return;

    var progressBar = new ProgressBar(PROGRESS_BAR_FORMAT, {
      complete: '=',
      incomplete: ' ',
      width: PROGRESS_BAR_WIDTH,
      total: 100,
      clear: true,
      stream: stream
    });
    progressBar.start = new Date;

    var progress = buildmessage.getRootProgress();
    progress.addWatcher(function (state) {
      var fraction;

      //progress.dump(process.stderr);
      //return;
      if (state.done) {
        //progressBar.terminate();
        //progressBar.update(1.0);
        fraction = 1.0;
      } else {
        var current = state.current;
        var end = state.end;
        if (end === undefined || end == 0 || current == 0) {
          fraction = progressBar.curr / progressBar.total;
        } else {
          fraction = current / end;
        }
      }

      // XXX: isNan
      //if (fraction > 0 && fraction <= 1.0) {
      progressBar.curr = Math.floor(fraction * progressBar.total);
      self._renderProgressBar();
      //}
    });

    self._progressBar = progressBar;
  }

});

Console.warning = Console.warn;

exports.Console = new Console;