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
/// In future, we might do things like move all support for verbose mode in here,
/// and also integrate the buildmessage functionality into here
///

var _ = require('underscore');
var Fiber = require('fibers');
var Future = require('fibers/future');
var readline = require('readline');
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

if (!process.env.METEOR_COLOR) {
  chalk.enabled = false;
}


STATUSLINE_MAX_LENGTH = 60;
STATUS_MAX_LENGTH = 40;

PROGRESS_MAX_WIDTH = 40;
PROGRESS_BAR_FORMAT = '[:bar] :percent :etas';
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
    // No-op
  },

  repaint: function () {
    // No-op
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
  }
});

var SpinnerRenderer = function () {
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

SpinnerRenderer.prototype.asString = function () {
  var self = this;
  var now = +(new Date);

  var t = now - self.start;
  var frame = Math.floor(t / self.interval) % self.frames.length;
  return self.frames[frame];
};

// Renders a progressbar.  Based on the npm 'progress' module, but tailored to our needs (i.e. renders to string)
var ProgressBarRenderer = function (format, options) {
  var self = this;

  options = options || {};

  self.fmt = format;
  self.curr = 0;
  self.total = 100;
  self.maxWidth = options.maxWidth || self.total;
  self.chars = {
    complete   : '=',
    incomplete : ' '
  };
};

_.extend(ProgressBarRenderer.prototype, {
  asString: function (availableSpace) {
    var self = this;

    var ratio = self.curr / self.total;
    ratio = Math.min(Math.max(ratio, 0), 1);

    var percent = ratio * 100;
    var incomplete, complete, completeLength;
    var elapsed = new Date - self.start;
    var eta = (percent == 100) ? 0 : elapsed * (self.total / self.curr - 1);

    /* populate the bar template with percentages and timestamps */
    var str = self.fmt
      .replace(':current', self.curr)
      .replace(':total', self.total)
      .replace(':elapsed', isNaN(elapsed) ? '0.0' : (elapsed / 1000).toFixed(1))
      .replace(':eta', (isNaN(eta) || !isFinite(eta)) ? '0.0' : (eta / 1000).toFixed(1))
      .replace(':percent', percent.toFixed(0) + '%');

    /* compute the available space (non-zero) for the bar */
    var width = Math.min(self.maxWidth, availableSpace - str.replace(':bar', '').length);

    /* NOTE: the following assumes the user has one ':bar' token */
    completeLength = Math.round(width * ratio);
    complete = Array(completeLength + 1).join(self.chars.complete);
    incomplete = Array(width - completeLength + 1).join(self.chars.incomplete);

    /* fill in the actual progress bar */
    str = str.replace(':bar', complete + incomplete);

    return str;
  }
});


var ProgressDisplayFull = function (console) {
  var self = this;

  self._console = console;
  self._stream = console._stream;

  self._status = '';

  var options = {
    complete: '=',
    incomplete: ' ',
    maxWidth: PROGRESS_MAX_WIDTH,
    total: 100
  };
  self._progressBarRenderer = new ProgressBarRenderer(PROGRESS_BAR_FORMAT, options);
  self._progressBarRenderer.start = new Date();

  self._spinnerRenderer = new SpinnerRenderer();

  self._fraction = undefined;

  self._printedLength = 0;
};

_.extend(ProgressDisplayFull.prototype, {
  depaint: function () {
    var self = this;

    self._stream.write(spacesString(self._printedLength) + "\r");
  },

  updateStatus: function (status) {
    var self = this;

    if (status == self._status) {
      return;
    }

    self._status = status;
    self._render();
  },

  updateProgress: function (fraction, startTime) {
    var self = this;

    self._fraction = fraction;
    if (fraction !== undefined) {
      self._progressBarRenderer.curr = Math.floor(fraction * self._progressBarRenderer.total);
    }
    if (startTime) {
      self._progressBarRenderer.start = startTime;
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

    // XXX: Throttle these updates?
    // XXX: Or maybe just jump to the correct position?
    var progressGraphic = '';

    // The cursor appears in position 0; we indent it a little to avoid this
    // This also means it appears less important, which is good
    var indentColumns = 3;

    var streamColumns = this._stream.columns;
    var statusColumns;
    var progressColumns;
    if (!streamColumns) {
      statusColumns = STATUS_MAX_LENGTH;
      progressColumns = 0;
    } else {
      statusColumns = Math.min(STATUS_MAX_LENGTH, streamColumns - indentColumns);
      progressColumns = Math.min(PROGRESS_MAX_WIDTH, streamColumns - indentColumns - statusColumns);
    }

    if (self._fraction !== undefined && progressColumns > 16) {
      // 16 is a heuristic number that allows enough space for a meaningful progress bar
      progressGraphic = "  " + self._progressBarRenderer.asString(progressColumns - 2);
    } else if (progressColumns > 3) {
      // 3 = 2 spaces + 1 spinner character
      progressGraphic = "  " + self._spinnerRenderer.asString();
    } else {
      // Don't show any progress graphic - no room!
    }

    if (text || progressGraphic) {
      // XXX: Just update the graphic, to avoid text flicker?

      var line = spacesString(indentColumns);
      var length = indentColumns;

      if (self._status) {
        var fixedLength = toFixedLength(self._status, statusColumns);
        line += chalk.bold(fixedLength);
        length += statusColumns;
      } else {
        line += spacesString(statusColumns);
        length += statusColumns;
      }

      line += progressGraphic + "\r";
      length += progressGraphic.length;

      self.depaint();
      self._stream.write(line);
      self._printedLength = length;
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
  self._stop = false;
};

_.extend(StatusPoller.prototype, {
  _startPoller: function () {
    var self = this;

    if (self._pollFiber) {
      throw new Error("Already started");
    }

    self._pollFiber = Fiber(function () {
      while (!self._stop) {
        sleep(100);

        self.statusPoll();
      }
    });
    self._pollFiber.run();
  },

  stop: function () {
    var self = this;

    self._stop = true;
  },

  statusPoll: function () {
    var self = this;

    // XXX: Early exit here if we're not showing status at all?

    self._lastStatusPoll = Date.now();

    var rootProgress = buildmessage.getRootProgress();
    if (PROGRESS_DEBUG) {
      // It can be handy for dev purposes to see all the executing tasks
      rootProgress.dump(process.stdout, {skipDone: true});
    }

    var reportState = function (state, startTime) {
      var progressDisplay = self._console._progressDisplay;
      // Do the % computation, if it is going to be used
      if (progressDisplay.updateProgress) {
        if (state.end === undefined || state.end == 0) {
          progressDisplay.updateProgress(undefined, startTime);
        } else {
          var fraction = state.done ? 1.0 : (state.current / state.end);

          if (!isNaN(fraction) && fraction >= 0) {
            progressDisplay.updateProgress(fraction, startTime);
          } else {
            progressDisplay.updateProgress(0, startTime);
          }
        }
      }
    };

    var watching = (rootProgress ? rootProgress.getCurrentProgress() : null);

    if (self._watching === watching) {
      // We need to do this to keep the spinner spinning
      // XXX: Should we _only_ do this when we're showing the spinner?
      reportState(watching.getState(), watching.startTime);
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

        reportState(state, watching.startTime);
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
  self._progressDisplayEnabled = false;

  self._logThreshold = LEVEL_CODE_INFO;
  var logspec = process.env.METEOR_LOG;
  if (logspec) {
    logspec = logspec.trim().toLowerCase();
    if (logspec == 'debug') {
      self._logThreshold = LEVEL_CODE_DEBUG;
    }
  }

  cleanup.onExit(function (sig) {
    self.enableProgressDisplay(false);
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
  LEVEL_ERROR: LEVEL_ERROR,
  LEVEL_WARN: LEVEL_WARN,
  LEVEL_INFO: LEVEL_INFO,
  LEVEL_DEBUG: LEVEL_DEBUG,

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

  // This can be called during long lived operations; it will keep the spinner spinning.
  // (This code used to be in Patience.nudge)
  //
  // It's frustrating when you write code that takes a while, either because it
  // uses a lot of CPU or because it uses a lot of network/IO.  In Node,
  // consuming lots of CPU without yielding is especially bad.
  // Other IO/network tasks will stall, and you can't even kill the process!
  //
  // Within any code that may burn CPU for too long, call `Console.nudge()`.
  // If it's been a while since your last yield, your Fiber will sleep momentarily.
  // It will also update the spinner if there is one and it's been a while.
  // The caller should be OK with yielding --- it has to be in a Fiber and it can't be
  // anything that depends for correctness on not yielding.  You can also call nudge(false)
  // if you just want to update the spinner and not yield, but you should avoid this.
  nudge: function (canYield) {
    var self = this;
    if (self._throttledStatusPoll.isAllowed()) {
      if (self._statusPoller) {
        self._statusPoller.statusPoll();
      }
    }
    if (canYield === undefined || canYield === true) {
      self._throttledYield.yield();
    }
  },

  isLevelEnabled: function (levelCode) {
    return (this.verbose || this._logThreshold <= levelCode);
  },

  isDebugEnabled: function () {
    return this.isLevelEnabled(LEVEL_CODE_DEBUG);
  },

  debug: function(/*arguments*/) {
    var self = this;
    if (!self.isDebugEnabled()) {
      return;
    }

    var message = self._format(arguments);
    self._print(LEVEL_DEBUG, message);
  },

  isInfoEnabled: function () {
    return this.isLevelEnabled(LEVEL_CODE_INFO);
  },

  info: function(/*arguments*/) {
    var self = this;
    if (!self.isInfoEnabled()) {
      return;
    }

    var message = self._format(arguments);
    self._print(LEVEL_INFO, message);
  },

  isWarnEnabled: function () {
    return this.isLevelEnabled(LEVEL_CODE_WARN);
  },

  warn: function(/*arguments*/) {
    var self = this;
    if (!self.isWarnEnabled()) {
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

    // XXX: Pause before showing the progress display, to prevent flicker/spewing messages
    // Repaint the progress display
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

  command: function (message) {
    return this.bold(message);
  },

  url: function (message) {
    return this.underline(message);
  },

  underline: function (message) {
    var self = this;

    if (!self._pretty) {
      return message;
    }
    return chalk.underline(message);
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
  enableProgressDisplay: function (enabled) {
    var self = this;

    // No arg => enable
    if (enabled === undefined) {
      enabled = true;
    }

    self._progressDisplayEnabled = enabled;
    self._updateProgressDisplay();
  },

  // In response to a change in setPretty or enableProgressDisplay,
  // configure the appropriate progressDisplay
  _updateProgressDisplay: function () {
    var self = this;

    var newProgressDisplay;

    if (!self._progressDisplayEnabled) {
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
      newProgressDisplay = new ProgressDisplayFull(self);
    }

    // Start/stop the status poller, so we never block exit
    if (self._progressDisplayEnabled) {
      if (!self._statusPoller) {
        self._statusPoller = new StatusPoller(self);
      }
    } else {
      if (self._statusPoller) {
        self._statusPoller.stop();
        self._statusPoller = null;
      }
    }

    self._setProgressDisplay(newProgressDisplay);
  },

  _setProgressDisplay: function (newProgressDisplay) {
    var self = this;

    // XXX: Optimize case of no-op transitions? (same mode -> same mode)

    var oldProgressDisplay = self._progressDisplay;
    oldProgressDisplay.depaint();

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
