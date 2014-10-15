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
var utils = require('./utils.js');

PROGRESS_DEBUG = !!process.env.METEOR_PROGRESS_DEBUG;
FORCE_PRETTY=undefined;
if (process.env.METEOR_PRETTY_OUTPUT) {
  FORCE_PRETTY = process.env.METEOR_PRETTY_OUTPUT != '0'
}

STATUS_MAX_LENGTH = 40;

// XXX: We're going to have to put the progress bar to the right of the text, I think...
PROGRESS_BAR_WIDTH = 20;
PROGRESS_BAR_FORMAT = '[:bar] :percent :etas';
STATUS_POSITION = PROGRESS_BAR_WIDTH + 15;
TEMP_STATUS_LENGTH = STATUS_MAX_LENGTH + 12;

STATUS_INTERVAL_MS = 500;

// Message to show when we don't know what we're doing
// XXX: ? FALLBACK_STATUS = 'Pondering';
FALLBACK_STATUS = '';

var spacesArray = new Array(200).join(' ');
var spacesString = function (length) {
  if (length > spacesArray.length) {
    spacesArray = new Array(length * 2).join(' ');
  }
  return spacesArray.substring(0, length);
};

var toFixedLength = function (text, length) {
  text = text || "";

  // pad or truncate `text` to length
  var pad = length - text.length;
  if (pad < 0) {
    // Truncate
    text = text.substring(0, length - 3) + "...";
  } else if (pad > 0) {
    // Pad
    text = text + spacesString(pad);
  }
  return text;
};

// No-op progress display, that means we don't have to handle the 'no progress display' case
var ProgressDisplayNone = function () {
};

_.extend(ProgressDisplayNone.prototype, {
  depaint: function () {
  },

  repaint: function () {

  },

  stop: function () {

  }
});

// Status display only, primarily for use with emacs
// No fancy terminal support available, but we have a TTY.
// Print messages that will be overwritten because they
// end in `\r`.
// Status message mode is where we see status messages but not the
// fancy progress bar.  It's used when we detect a "pseudo-TTY"
// of the type used by Emacs, and possibly SSH.
var ProgressDisplayStatus = function (console) {
  var self = this;

  self._console = console;
  self._stream = console._stream;

  self._status = null;
  self._wroteStatusMessage = false;
};

_.extend(ProgressDisplayStatus.prototype, {
  depaint: function () {
    var self = this;
    // For the non-progress-bar status mode, we may need to
    // clear some characters that we printed with a trailing `\r`.
    if (self._wroteStatusMessage) {
      var spaces = spacesString(TEMP_STATUS_LENGTH + 1);
      self._stream.write(spaces + '\r');
      self._wroteStatusMessage = false;
    }
  },

  repaint: function () {
    // We don't repaint after a log message (is that right?)
  },

  updateStatus: function (status) {
    var self = this;

    if (status == self._status) {
      return;
    }

    self._status = status;
    self._render();
  },

  _render: function () {
    var self = this;

    var text = self._status;
    if (text) {
      text = toFixedLength(text, STATUS_MAX_LENGTH);
    }

    if (text) {
      // the number of characters besides `text` here must
      // be accounted for in TEMP_STATUS_LENGTH.
      self._stream.write('  (  ' + text + '  ... )\r');
      self._wroteStatusMessage = true;
    }
  },

  stop: function () {
    var self = this;

    self.depaint();
  }
});


// XXX: Remove Patience
// XXX: Preserve comments
// XXX: Implement the delay-before-print logic?

// Patience: a way to make slow operations a little more bearable.
//
// It's frustrating when you write code that takes a while, either because it
// uses a lot of CPU or because it uses a lot of network/IO. There are two
// issues:
//   - It would be nice to apologize/explain to users that an operation is
//     taking a while... but not to spam them with the message when the
//     operation is fast. This is true no matter which kind of slowness we
///    have.
//   - In Node, consuming lots of CPU without yielding is especially bad.
//     Other IO/network tasks will stall, and you can't even kill the process!
//
// Patience is a class to help alleviate the pain of long waits.  When you're
// going to run a long operation, create a Patience object; when it's done (make
// sure to use try/finally!), stop() it.
//
// Within any code that may burn CPU for too long, call
// `utils.Patience.nudge()`.  (This is a singleton method, not a method on your
// particular patience.)  If there are any active Patience objects and it's been
// a while since your last yield, your Fiber will sleep momentarily.  (So the
// caller has to be OK with yielding --- it has to be in a Fiber and it can't be
// anything that depends for correctness on not yielding!)
//
// In addition, for each Patience, you can specify a message (a string to print
// or a function to call) and a timeout for when that gets called.  We use two
// strategies to try to call it: a standard JavaScript timeout, and as a backup
// in case we're getting CPU-starved, we also check during each nudge.  The
// message will not be printed after the Patience is stopped, which prevents you
// from apologizing to users about operations that don't end up being slow.
//exports.Patience = function (options) {
//  var self = this;
//
//  self._id = nextPatienceId++;
//  ACTIVE_PATIENCES[self._id] = self;
//
//  self._whenMessage = null;
//  self._message = null;
//  self._messageTimeout = null;
//
//  var now = +(new Date);
//
//  if (options.messageAfterMs) {
//    if (!options.message)
//      throw Error("missing message!");
//    if (typeof(options.message) !== 'string' &&
//      typeof(options.message) !== 'function') {
//      throw Error("message must be string or function");
//    }
//    self._message = "\n" + options.message;
//    self._whenMessage = now + options.messageAfterMs;
//    self._messageTimeout = setTimeout(function () {
//      self._messageTimeout = null;
//      self._printMessage();
//    }, options.messageAfterMs);
//  }
//
//  // If this is the first patience we made, the next yield time is
//  // YIELD_EVERY_MS from now.
//  if (_.size(ACTIVE_PATIENCES) === 1) {
//    nextYield = now + YIELD_EVERY_MS;
//  }
//};

//var nextYield = null;
//var YIELD_EVERY_MS = 150;
//var ACTIVE_PATIENCES = {};
//var nextPatienceId = 1;
//
//exports.Patience.nudge = function () {
//  // Is it time to yield?
//  if (!_.isEmpty(ACTIVE_PATIENCES) &&
//    +(new Date) >= nextYield) {
//    nextYield = +(new Date) + YIELD_EVERY_MS;
//    utils.sleepMs(1);
//  }
//
//  // save a copy, in case it gets updated
//  var patienceIds = _.keys(ACTIVE_PATIENCES);
//  _.each(patienceIds, function (id) {
//    if (_.has(ACTIVE_PATIENCES, id)) {
//      ACTIVE_PATIENCES[id]._maybePrintMessage();
//    }
//  });
//};
//
//_.extend(exports.Patience.prototype, {
//  stop: function () {
//    var self = this;
//    delete ACTIVE_PATIENCES[self._id];
//    if (_.isEmpty(ACTIVE_PATIENCES)) {
//      nextYield = null;
//    }
//    self._clearMessageTimeout();
//  },
//
//  _maybePrintMessage: function () {
//    var self = this;
//    var now = +(new Date);
//
//    // Is it time to print a message?
//    if (self._whenMessage && +(new Date) >= self._whenMessage) {
//      self._printMessage();
//    }
//  },
//
//  _printMessage: function () {
//    var self = this;
//    // Did the timeout just fire, but we already printed the message due to a
//    // nudge while CPU-bound? We're done. (This shouldn't happen since we clear
//    // the timeout, but just in case...)
//    if (self._message === null)
//      return;
//    self._clearMessageTimeout();
//    // Pull out message, in case it's a function and it yields.
//    var message = self._message;
//    self._message = null;
//    if (typeof (message) === 'function') {
//      message();
//    } else {
//      console.log(message);
//    }
//  },
//
//  _clearMessageTimeout: function () {
//    var self = this;
//    if (self._messageTimeout) {
//      clearTimeout(self._messageTimeout);
//      self._messageTimeout = null;
//    }
//    self._whenMessage = null;
//  }
//});

var Spinner = function () {
  var self = this;
  self.frames = ['-', '\\', '|', '/'];
  self.start = +(new Date);
  self.interval = 250;
  //// I looked at some Unicode indeterminate progress indicators, such as:
  ////
  //// spinner = "▁▃▄▅▆▇▆▅▄▃".split('');
  //// spinner = "▉▊▋▌▍▎▏▎▍▌▋▊▉".split('');
  //// spinner = "▏▎▍▌▋▊▉▊▋▌▍▎▏▁▃▄▅▆▇▆▅▄▃".split('');
  //// spinner = "▉▊▋▌▍▎▏▎▍▌▋▊▉▇▆▅▄▃▁▃▄▅▆▇".split('');
  //// spinner = "⠉⠒⠤⣀⠤⠒".split('');
  ////
  //// but none of them really seemed like an improvement. I think
  //// the case for using unicode would be stronger in a determinate
  //// progress indicator.
  ////
  //// There are also some four-frame options such as ◐◓◑◒ at
  ////   http://stackoverflow.com/a/2685827/157965
  //// but all of the ones I tried look terrible in the terminal.
};

Spinner.prototype.currentFrame = function () {
  var self = this;
  var now = +(new Date);

  var t = now - self.start;
  var frame = Math.floor(t / self.interval) % self.frames.length;
  return self.frames[frame];
};

var ProgressDisplayBar = function (console) {
  var self = this;

  self._console = console;
  self._stream = console._stream;

  self._status = '';

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
  self._spinner = new Spinner();

  self._fraction = undefined;
};

_.extend(ProgressDisplayBar.prototype, {
  depaint: function () {
    var self = this;

    self._stream.clearLine();
    self._stream.cursorTo(0);
  },

  stop: function () {
    var self = this;

    self._progressBar.terminate();
    self._progressBar = null;
  },

  updateStatus: function (status) {
    var self = this;

    if (status == self._status) {
      return;
    }

    self._status = status;
    self._render();
  },

  updateProgress: function (fraction) {
    var self = this;

    self._fraction = fraction;
    if (fraction !== undefined) {
      self._progressBar.curr = Math.floor(fraction * self._progressBar.total);
    }
    self._render();
  },

  repaint: function () {
    var self = this;
    self._render();
  },

  _render: function () {
    var self = this;

    var text = self._status;
    if (text) {
      text = toFixedLength(text, STATUS_MAX_LENGTH);
    }

    if (self._fraction !== undefined) {
      // XXX: Throttle progress bar repaints (but it looks like we're doing our own anyway)
      // Force repaint
      self._progressBar.lastDraw = '';
      self._progressBar.render();
    } else {
      // XXX: Maybe throttle here too?
      // XXX: Or maybe just jump to the correct position
      self._stream.clearLine();
      self._stream.cursorTo(0);

      self._stream.write(self._spinner.currentFrame());
    }

    if (text) {
      self._stream.cursorTo(STATUS_POSITION);
      self._stream.write(chalk.bold(text));
    }
  }
});

var StatusPoller = function (console) {
  var self = this;

  // The current progress we are watching
  self._watching = null;

  self._console = console;

  self._pollFiber = null;
  self._startPoller();
};

_.extend(StatusPoller.prototype, {
  _startPoller: function () {
    var self = this;

    if (self._pollFiber) {
      throw new Error("Already started");
    }

    self._pollFiber = Fiber(function () {
      while (true) {
        sleep(100);

        self.statusPoll();
      }
    });
    self._pollFiber.run();
  },

  statusPoll: function () {
    var self = this;

    // XXX: Early exit here if we're not showing status at all?

    self._lastStatusPoll = Date.now();

    var rootProgress = buildmessage.getRootProgress();
    if (PROGRESS_DEBUG) {
      rootProgress.dump(process.stdout, {skipDone: true});
    }
    var watching = (rootProgress ? rootProgress.getCurrentProgress() : null);
    if (self._watching === watching) {
      return;
    }

    self._watching = watching;
    var title = (watching != null ? watching._title : null) || FALLBACK_STATUS;

    var progressDisplay = self._console._progressDisplay;
    progressDisplay.updateStatus && progressDisplay.updateStatus(title);

    if (watching) {
      watching.addWatcher(function (state) {
        if (watching != self._watching) {
          // No longer active
          // XXX: De-register with watching? (we don't bother right now because dead tasks tell no status)
          return;
        }

        var progressDisplay = self._console._progressDisplay;
        if (!progressDisplay.updateProgress) {
          // Progress bar doesn't show progress; don't bother with the % computation
          return;
        }

        if (state.end === undefined || state.end == 0) {
          progressDisplay.updateProgress(undefined);
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
            fraction = 0;
          } else {
            fraction = current / end;
          }
        }

        if (!isNaN(fraction) && fraction >= 0) {
          progressDisplay.updateProgress(fraction);
        } else {
          progressDisplay.updateProgress(0);
        }
      });
    }
  }
});

var Console = function (options) {
  var self = this;

  options = options || {};

  // The progress display we are showing on-screen
  self._progressDisplay = new ProgressDisplayNone(self);

  self._statusPoller = null;

  self._throttledYield = new utils.ThrottledYield();
  self._throttledStatusPoll = new utils.Throttled(STATUS_INTERVAL_MS);

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
  self._progressBarEnabled = false;

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
    self._updateProgressDisplay();
  },

  setVerbose: function (verbose) {
    var self = this;
    self.verbose = verbose;
  },

  // XXX: Move docs from Patience.nudge()
  // Like Patience.nudge(); this can be called during long lived operations
  // where the timer may be starved off the CPU.  It will execute the poll if
  // it has been 'too long'
  nudge: function (canYield) {
    var self = this;
    if (self._throttledStatusPoll.isAllowed()) {
      if (self._statusPoller) {
        self._statusPoller.statusPoll();
      }
    }
    // XXX: Maybe we should make canYield the default?
    if (canYield === true) {
      self._throttledYield.yield();
    }
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

    // We need to hide the progress bar/spinner before printing the message
    var progressDisplay = self._progressDisplay;
    progressDisplay.depaint();

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

    if (style) {
      dest.write(style(message + '\n'));
    } else {
      dest.write(message + '\n');
    }

    // Repaint the progress bar
    progressDisplay.repaint();
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

  // Enables the progress bar, or disables it when called with (false)
  enableProgressBar: function (enabled) {
    var self = this;

    // No arg => enable
    if (enabled === undefined) {
      enabled = true;
    }

    self._progressBarEnabled = enabled;
    self._updateProgressDisplay();
  },

  // In response to a change in setPretty or enableProgressBar,
  // configure the appropriate progressDisplay
  _updateProgressDisplay: function () {
    var self = this;

    var newProgressDisplay;

    if (!self._progressBarEnabled) {
      newProgressDisplay = new ProgressDisplayNone();
    } else if ((!self._stream.isTTY) || (!self._pretty)) {
      // No progress bar if not in pretty / on TTY.
      newProgressDisplay = new ProgressDisplayNone(self);
    } else if (self._stream.isTTY && !self._stream.columns) {
      // We might be in a pseudo-TTY that doesn't support
      // clearLine() and cursorTo(...).
      // It's important that we only enter status message mode
      // if self._pretty, so that we don't start displaying
      // status messages too soon.
      newProgressDisplay = new ProgressDisplayStatus(self);
    } else {
      // Otherwise we can do the full progress bar
      newProgressDisplay = new ProgressDisplayBar(self);
    }

    // Start the status poller if it hasn't been started
    if (!self._statusPoller) {
      self._statusPoller = new StatusPoller(self);
    }

    self._setProgressDisplay(newProgressDisplay);
  },

  _setProgressDisplay: function (newProgressDisplay) {
    var self = this;

    // XXX: Optimize case of no-op transitions? (same mode -> same mode)

    var oldProgressDisplay = self._progressDisplay;
    oldProgressDisplay.stop();

    self._progressDisplay = newProgressDisplay;
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

  var previousProgressDisplay = self._progressDisplay;
  self._setProgressDisplay(new ProgressDisplayNone());

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
    self._setProgressDisplay(previousProgressDisplay);
    fut['return'](line);
  });

  return fut.wait();
};


exports.Console = new Console;
