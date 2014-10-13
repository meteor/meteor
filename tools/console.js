///
/// utility functions for formatting output to the screen
///
/// Console offers several pieces of functionality:
///   debug / info / warn messages:
///     Outputs to the screen, optionally with colors (when pretty == true)
///   'legacy' functions: Console.stdout.write & Console.stderr.write
///     Make porting code a lot easier (just a regex from process -> Console)
///   Progress bar support
///     Displays a progress bar on the screen, but hides it around log messages
///     (The need to hide it is why we have this class)
///
/// In future, we might do things like support verbose mode in here,
/// and also integrate the buildmessage functionality into here
///

var _ = require('underscore');
var Fiber = require('fibers');
var Future = require('fibers/future');
var readline = require('readline');
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

  // The progress bar we are showing on-screen, if enabled
  self._progressBar = null;
  // The current status text for the progress bar
  self._progressBarText = null;
  // The current progress we are watching
  self._watching = null;

  self._statusPoller = null;
  self._lastStatusPoll = 0;

  self.verbose = false;

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
  // Status message mode is where we see status messages but not the
  // fancy progress bar.  It's used when we detect a "pseudo-TTY"
  // of the type used by Emacs, and possibly SSH.
  self._inStatusMessageMode = false;
  self._wroteStatusMessage = false;

  self._logThreshold = LEVEL_CODE_INFO;
  var logspec = process.env.METEOR_LOG;
  if (logspec) {
    logspec = logspec.trim().toLowerCase();
    if (logspec == 'debug') {
      self._logThreshold = LEVEL_CODE_DEBUG;
    }
  }

  cleanup.onExit(function (sig) {
    self.enableProgressBar(false);
  });
};


PROGRESS_BAR_WIDTH = 20;
PROGRESS_BAR_FORMAT = '[:bar] :percent :etas';
STATUS_POSITION = PROGRESS_BAR_WIDTH + 15;
STATUS_MAX_LENGTH = 40;
TEMP_STATUS_LENGTH = STATUS_MAX_LENGTH + 12;

STATUS_INTERVAL_MS = 500;

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
  setPretty: function (pretty) {
    var self = this;
    if (FORCE_PRETTY === undefined) {
      self._pretty = pretty;
    }
  },

  setVerbose: function (verbose) {
    var self = this;
    self.verbose = verbose;
  },

  _renderProgressBar: function () {
    var self = this;

    var text = self._progressBarText;
    if (text) {
      // pad or truncate `text` to STATUS_MAX_LENGTH
      if (text.length > STATUS_MAX_LENGTH) {
        text = text.substring(0, STATUS_MAX_LENGTH - 3) + "...";
      } else {
        while (text.length < STATUS_MAX_LENGTH) {
          text = text + ' ';
        }
      }
    }

    if (self._progressBar) {
      // Force repaint
      self._progressBar.lastDraw = '';

      self._progressBar.render();

      if (text) {
        self._stream.cursorTo(STATUS_POSITION);
        self._stream.write(chalk.bold(text));
      }
    } else if (self._inStatusMessageMode) {
      // No fancy terminal support available, but we have a TTY.
      // Print messages that will be overwritten because they
      // end in `\r`.
      if (text) {
        // the number of characters besides `text` here must
        // be accounted for in TEMP_STATUS_LENGTH.
        self._stream.write('  (  ' + text + '  ... )\r');
        self._wroteStatusMessage = true;
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

  // Like Patience.nudge(); this can be called during long lived operations
  // where the timer may be starved off the CPU.  It will execute the poll if
  // it has been 'too long'
  statusPollMaybe: function () {
    var self = this;
    var now = Date.now();

    if ((now - self._lastStatusPoll) < STATUS_INTERVAL_MS) {
      return;
    }
    self._statusPoll();
  },

  enableStatusPoll: function () {
    var self = this;
    Fiber(function () {
      while (true) {
        sleep(STATUS_INTERVAL_MS);

        self._statusPoll();
      }
    }).run();
  },

  debug: function(/*arguments*/) {
    var self = this;
    if (!self.verbose && self._logThreshold > LEVEL_CODE_DEBUG) {
      return;
    }

    var message = self._format(arguments);
    self._print(LEVEL_DEBUG, message);
  },

  info: function(/*arguments*/) {
    var self = this;
    if (self._logThreshold > LEVEL_CODE_INFO) {
      return;
    }

    var message = self._format(arguments);
    self._print(LEVEL_INFO, message);
  },

  warn: function(/*arguments*/) {
    var self = this;
    if (self._logThreshold > LEVEL_CODE_WARN) {
      return;
    }

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
    if(message.substr && message.substr(-1) == '\n') {
      message = message.substr(0, message.length - 1);
    }
    self._print(level, message);
  },

  _print: function(level, message) {
    var self = this;

    // We need to hide the progress bar before printing the message
    var progressBar = self._progressBar;
    if (progressBar) {
      self._stream.clearLine();
      self._stream.cursorTo(0);
    }

    // stdout/stderr is determined by the log level
    // XXX: We should probably just implement Loggers with observers
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

    // Pick the color/weight if in pretty mode
    var style = null;
    if (level && self._pretty) {
      switch (level.code) {
        case LEVEL_CODE_ERROR:
          style = chalk.bold.red;
          break;
        case LEVEL_CODE_WARN:
          style = chalk.red;
          break;
      }
    }

    self._clearStatusMessage();

    if (style) {
      dest.write(style(message + '\n'));
    } else {
      dest.write(message + '\n');
    }

    // Repaint the progress bar if we hid it
    if (progressBar) {
      self._renderProgressBar();
    }
  },

  success: function (message) {
    var self = this;

    if (!self._pretty) {
      return message;
    }
    return chalk.green('\u2713 ' + message);
  },

  fail: function (message) {
    var self = this;

    if (!self._pretty) {
      return message;
    }
    return chalk.red('\u2717 ' + message);
  },

  bold: function (message) {
    var self = this;

    if (!self._pretty) {
      return message;
    }
    return chalk.bold(message);
  },

  _clearStatusMessage: function () {
    var self = this;
    // For the non-progress-bar status mode, we may need to
    // clear some characters that we printed with a trailing `\r`.
    if (self._wroteStatusMessage) {
      var spaces = new Array(TEMP_STATUS_LENGTH + 1).join(' ');
      self._stream.write(spaces + '\r');
      self._wroteStatusMessage = false;
    }
  },

  _format: function (logArguments) {
    var self = this;

    var message = '';
    for (var i = 0; i < logArguments.length; i++) {
      if (i != 0) message += ' ';
      message += logArguments[i];
    }

    return message;
  },

  printError: function (err, info) {
    var self = this;

    var message = err.message;
    if (!message) {
      message = "Unexpected error";
      if (self.verbose) {
        message += " (" + err.toString() + ")";
      }
    }

    if (info) {
      message = info + ": " + message;
    }

    self.error(message);
    if (self.verbose && err.stack) {
      self.info(err.stack);
    }
  },

  printMessages: function (messages) {
    var self = this;

    if (messages.hasMessages()) {
      self._print(null, "\n" + messages.formatMessages());
    }
  },

  isProgressBarEnabled: function () {
    // "status message mode" counts as having a progress bar
    // as far as the caller of enableProgressBar is considered,
    // because you get it by calling enableProgressBar(true)
    // and not having a real TTY.
    return this._progressBar || this._inStatusMessageMode;
  },

  // Enables the progress bar, or disables it when called with (false)
  enableProgressBar: function (enabled) {
    var self = this;

    // No arg => enable
    if (enabled === undefined) {
      enabled = true;
    }

    // Ignore if not in pretty / on TTY.
    if ((! self._stream.isTTY) || (! self._pretty)) {
      self._inStatusMessageMode = false;
      return;
    }
    if (self._stream.isTTY && ! self._stream.columns) {
      // We might be in a pseudo-TTY that doesn't support
      // clearLine() and cursorTo(...).
      // It's important that we only enter status message mode
      // if self._pretty, so that we don't start displaying
      // status messages too soon.
      if (enabled) {
        self._inStatusMessageMode = true;
      } else if (self._inStatusMessageMode) {
        self._clearStatusMessage();
        self._inStatusMessageMode = false;
      }
      return;
    }

    if (enabled && !self._progressBar) {
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
    } else if (!enabled && self._progressBar) {
      self._progressBar.terminate();
      self._progressBar = null;
    }

    // Start the status poller, which watches the task tree, and periodically
    // repoints the progress bar to the 'active' task.
    if (enabled && !self._statusPoller) {
      self._statusPoller = Fiber(function () {
        while (true) {
          sleep(100);

          if (!self._progressBar) {
            // Stop when we are turned off
            // XXX: In theory, this is a race (?)
            self._statusPoller = null;
            return;
          }

          self._statusPoll();
        }
      });
      self._statusPoller.run();
    } else {
      // The status-poller self-exits when _progressBar is null
    }
  },

  _watchProgress: function () {
    var self = this;

    var watching = self._watching;
    if (!watching) {
      // No active task
      return;
    }

    watching.addWatcher(function (state) {
      if (watching != self._watching) {
        // No longer active
        // XXX: De-register with watching?
        return;
      }

      var progressBar = self._progressBar;
      if (!progressBar) {
        // Progress bar disabled; don't bother with the computation
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

// options:
//   - echo (boolean): defaults to true
//   - prompt (string)
//   - stream: defaults to process.stdout (you might want process.stderr)
Console.prototype.readLine = function (options) {
  var self = this;

  var fut = new Future();

  options = _.extend({
    echo: true,
    stream: self._stream
  }, options);

  var silentStream = {
    write: function () {
    },
    on: function () {
    },
    end: function () {
    },
    isTTY: options.stream.isTTY,
    removeListener: function () {
    }
  };

  var wasProgressBar = self.isProgressBarEnabled();
  self.enableProgressBar(false);

  // Read a line, throwing away the echoed characters into our dummy stream.
  var rl = readline.createInterface({
    input: process.stdin,
    output: options.echo ? options.stream : silentStream,
    // `terminal: options.stream.isTTY` is the default, but emacs shell users
    // don't want fancy ANSI.
    terminal: options.stream.isTTY && process.env.EMACS !== 't'
  });

  if (! options.echo) {
    options.stream.write(options.prompt);
  } else {
    rl.setPrompt(options.prompt);
    rl.prompt();
  }

  rl.on('line', function (line) {
    rl.close();
    if (! options.echo)
      options.stream.write("\n");
    if (wasProgressBar)
      self.enableProgressBar(true);
    fut['return'](line);
  });

  return fut.wait();
};


exports.Console = new Console;
