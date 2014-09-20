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
var cleanup = require('./cleanup.js');

PROGRESS_DEBUG = !!process.env.METEOR_PROGRESS_DEBUG;
FORCE_PRETTY=undefined;
if (process.env.METEOR_PRETTY_OUTPUT) {
  FORCE_PRETTY = process.env.METEOR_PRETTY_OUTPUT != '0'
}

var Console = function (options) {
  var self = this;

  options = options || {};

  self._progressBar = null;
  self._progressBarText = null;
  self._watching = null;

  self._lastStatusPoll = 0;

  // Legacy helpers
  self.stdout = {};
  self.stderr = {};
  self.stdout.write = function (msg) {
    self._legacyWrite(LEVEL_INFO, msg);
  };
  self.stderr.write = function (msg) {
    self._legacyWrite(LEVEL_WARN, msg);
  };

  self._stream = process.stdout;

  self._pretty = (FORCE_PRETTY !== undefined ? FORCE_PRETTY : false);

  cleanup.onExit(function (sig) {
    self.hideProgressBar();
  });
};


PROGRESS_BAR_WIDTH = 20;
PROGRESS_BAR_FORMAT = '[:bar] :percent :etas';
STATUS_POSITION = PROGRESS_BAR_WIDTH + 15;
STATUS_MAX_LENGTH = 40;


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

  setPretty: function (pretty) {
    var self = this;
    if (FORCE_PRETTY === undefined) {
      self._pretty = pretty;
    }
  },

  _renderProgressBar: function () {
    var self = this;
    if (self._progressBar) {
      self._progressBar.render();
      if (self._progressBarText) {
        var text = self._progressBarText;
        if (text > STATUS_MAX_LENGTH) {
          text = text.substring(0, STATUS_MAX_LENGTH - 3) + "...";
        } else {
          while (text.length < STATUS_MAX_LENGTH) {
            text = text + ' ';
          }
        }
        self._stream.cursorTo(STATUS_POSITION);
        self._stream.write(chalk.bold(text));
      }
    }
  },

  _statusPoll: function () {
    var self = this;

    self._lastStatusPoll = Date.now();

    var rootProgress = buildmessage.getRootProgress();
    if (PROGRESS_DEBUG) {
      rootProgress.dump(process.stdout, {skipDone: true});
    }
    var current = (rootProgress ? rootProgress.getCurrentProgress() : null);
    if (self._watching === current) {
      return;
    }

    self._watching = current;
    var title = (current != null ? current._title : null) || FALLBACK_STATUS;
    if (title != self._progressBarText) {
      self._progressBarText = title;
      self._renderProgressBar();
    }

    self._watchProgress();
  },

  statusPollMaybe: function () {
    var self = this;
    var now = Date.now();

    if ((now - self._lastStatusPoll) < 50) {
      return;
    }
    self._statusPoll();
  },

  enableStatusPoll: function () {
    var self = this;
    Fiber(function () {
      while (true) {
        sleep(10);

        self._statusPoll();
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

  _legacyWrite: function (level, message) {
    var self = this;
    if(message.substr(-1) == '\n') {
      message = message.substr(0, message.length - 1);
    }
    self._print(level, message);
  },

  _print: function(level, message) {
    var self = this;

    var progressBar = self._progressBar;
    if (progressBar) {
      //progressBar.terminate();
      self._stream.clearLine();
      self._stream.cursorTo(0);
    }

    var dest = process.stdout;
    if (level) {
      switch (level.code) {
        case LEVEL_CODE_ERROR:
          dest = process.stderr;
          break;
        case LEVEL_CODE_WARN:
          dest = process.stderr;
          break;
      }
    }

    var style = null;
    if (level && self._pretty) {
      switch (level.code) {
        case LEVEL_CODE_ERROR:
          style = chalk.bold.red;
          break;
        case LEVEL_CODE_WARN:
          style = chalk.red;
          break;
        //case LEVEL_CODE_INFO:
        //  style = chalk.blue;
        //  break;
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

    if (!self._stream.isTTY || !self._pretty) return;

    var options = {
      complete: '=',
      incomplete: ' ',
      width: PROGRESS_BAR_WIDTH,
      total: 100,
      clear: true,
      stream: self._stream
    };

    var progressBar = new ProgressBar(PROGRESS_BAR_FORMAT, options);
    progressBar.start = new Date;

    self._progressBar = progressBar;
  },

  _watchProgress: function () {
    var self = this;

    var progress = self._watching;
    if (!progress) {
      self.hideProgressBar();
      return;
    }

    progress.addWatcher(function (state) {
      //console.log(state);
      if (progress != self._watching) {
        // No longer active
        //console.log("NOT WATCHING");
        return;
      }

      var progressBar = self._progressBar;
      if (!progressBar) {
        //console.log("NOT PROGRESS BAR");
        // Progress bar disabled
        return;
      }

      var fraction;
      if (state.done) {
        fraction = 1.0;
      } else {
        var current = state.current;
        var end = state.end;
        if (end === undefined || end == 0 || current == 0) {
          // Arbitrary end-point
          fraction = progressBar.curr / 100;
        } else {
          fraction = current / end;
        }
      }

      if (!isNaN(fraction) && fraction >= 0) {
        progressBar.curr = Math.floor(fraction * progressBar.total);
        self._renderProgressBar();
      }
    });
  }

});

Console.prototype.warning = Console.prototype.warn;

exports.Console = new Console;