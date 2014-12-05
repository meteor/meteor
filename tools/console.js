///
/// A set of utility functions for formatting output sent to the screen.
///
/// Console offers several pieces of functionality:
///  - debug / info / warn messages: Output to the screen, optionally with
///    colors (when pretty == true).  Wrap the output to the width of the user's
///    terminal, making sure to not split the same word over multiple
///    lines. (Also provides 'rawInfo', 'rawDebug' (etc) for when you DON'T want
///    to pre-process the output.)
///  - Progress bar support
///    Display a progress bar on the screen, but hide it around log messages.
///  - 'legacy' functions: Console.stdout.write & Console.stderr.write
///    Make porting code a lot easier (just a regex from process -> Console)
///
/// In future, we might do things like move all support for verbose mode in
/// here, and also integrate the buildmessage functionality into here
///

var _ = require('underscore');
var Fiber = require('fibers');
var Future = require('fibers/future');
var readline = require('readline');
var util = require('util');
var buildmessage = require('./buildmessage.js');
// XXX: Are we happy with chalk (and its sub-dependencies)?
var chalk = require('chalk');
var cleanup = require('./cleanup.js');
var utils = require('./utils.js');
var wordwrap = require('wordwrap');

var PROGRESS_DEBUG = !!process.env.METEOR_PROGRESS_DEBUG;
var FORCE_PRETTY=undefined;
if (process.env.METEOR_PRETTY_OUTPUT) {
  FORCE_PRETTY = process.env.METEOR_PRETTY_OUTPUT != '0';
}

if (! process.env.METEOR_COLOR) {
  chalk.enabled = false;
}

var STATUSLINE_MAX_LENGTH = 60;  // XXX unused?
var STATUS_MAX_LENGTH = 40;

var PROGRESS_MAX_WIDTH = 40;
var PROGRESS_BAR_FORMAT = '[:bar] :percent :etas';
var TEMP_STATUS_LENGTH = STATUS_MAX_LENGTH + 12;

var STATUS_INTERVAL_MS = 500;

// Message to show when we don't know what we're doing
// XXX: ? FALLBACK_STATUS = 'Pondering';
var FALLBACK_STATUS = '';

// If there is a part of the larger text, and we really want to make sure that
// it doesn't get split up, we will replace the space with a utf character that
// we are not likely to use anywhere else. This one looks like the sun! We
// intentionally want to NOT use a space-like character: it should be obvious
// that something has gone wrong if this ever gets printed.
var SPACE_REPLACEMENT = '\u2600';
// In Javascript, replace only replaces the first occurance and this is the
// proposed alternative.
var replaceAll = function (str, search, replace) {
 return str.split(search).join(replace);
};

var spacesArray = new Array(200).join(' ');
var spacesString = function (length) {
  if (length > spacesArray.length) {
    spacesArray = new Array(length * 2).join(' ');
  }
  return spacesArray.substring(0, length);
};
var ARROW = "=> ";


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

// No-op progress display, that means we don't have to handle the 'no progress
// display' case
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
//
// XXX DELETE THIS MODE since the progress bar now uses "\r".
// But first we have to throttle progress bar updates so that
// Emacs doesn't get overwhelemd (we should throttle them anyway).
// There's also a bug when using the progress bar in Emacs where
// the cursor doesn't seem to return to column 0.
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
      .replace(':eta', (isNaN(eta) || ! isFinite(eta)) ? '0.0' : (eta / 1000).toFixed(1))
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
    if (! streamColumns) {
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
      while (! self._stop) {
        utils.sleepMs(100);

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

          if (! isNaN(fraction) && fraction >= 0) {
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


var LEVEL_CODE_ERROR = 4;
var LEVEL_CODE_WARN = 3;
var LEVEL_CODE_INFO = 2;
var LEVEL_CODE_DEBUG = 1;

var LEVEL_ERROR = { code: LEVEL_CODE_ERROR };
var LEVEL_WARN = { code: LEVEL_CODE_WARN };
var LEVEL_INFO = { code: LEVEL_CODE_INFO };
var LEVEL_DEBUG = { code: LEVEL_CODE_DEBUG };

// We use a special class to represent the options that we send to the Console
// because it allows us to call 'instance of' on the last argument of variadic
// functions. This allows us to keep the signature of our custom output
// functions (ex: info) roughly the same as the originals.
var ConsoleOptions = function (o) {
  var self = this;
  self.options = o;
}

_.extend(Console.prototype, {
  LEVEL_ERROR: LEVEL_ERROR,
  LEVEL_WARN: LEVEL_WARN,
  LEVEL_INFO: LEVEL_INFO,
  LEVEL_DEBUG: LEVEL_DEBUG,

  setPretty: function (pretty) {
    var self = this;
    // If we're being forced, do nothing.
    if (FORCE_PRETTY !== undefined)
      return;
    // If no change, do nothing.
    if (self._pretty === pretty)
      return;
    self._pretty = pretty;
    self._updateProgressDisplay();
  },

  // Runs f with the progress display visible (ie, with progress display enabled
  // and pretty). Resets both flags to their original values after f runs.
  withProgressDisplayVisible: function (f) {
    var self = this;
    var originalPretty = self._pretty;
    var originalProgressDisplayEnabled = self._progressDisplayEnabled;

    // Turn both flags on.
    self._pretty = self._progressDisplayEnabled = true;

    // Update the screen if anything changed.
    if (! originalPretty || ! originalProgressDisplayEnabled)
      self._updateProgressDisplay();

    try {
      return f();
    } finally {
      // Reset the flags.
      self._pretty = originalPretty;
      self._progressDisplayEnabled = originalProgressDisplayEnabled;
      // Update the screen if anything changed.
      if (! originalPretty || ! originalProgressDisplayEnabled)
        self._updateProgressDisplay();
    }
  },

  setVerbose: function (verbose) {
    var self = this;
    self.verbose = verbose;
  },

  // Get the current width of the Console.
  width: function () {
    var width = 80;
    var stream = process.stdout;
    if (stream && stream.isTTY && stream.columns) {
      width = stream.columns;
    }
    return width;
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

  // Initializes and returns a new ConsoleOptions object. This allows us to call
  // 'instance of' on the ConsoleOptions in parseVariadicInput, by ensuring that
  // the object created with Console.options is, in fact, a new object.
  options: function (o) {
    return new ConsoleOptions(o);
  },

  // Deal with the arguments to a variadic print function that also takes an
  // optional ConsoleOptions argument at the end.
  //
  // Returns an object with keys:
  //  - opts: The options that were passed in, or an empty object.
  //  - message: Arguments to the original function, parsed as a string.
  //
  _parseVariadicInput: function (args) {
    var self = this;
    var msgArgs;
    var opts;
    // If the last argument is an instance of ConsoleOptions, then we should
    // separate it out, and only send the first N-1 arguments to be parsed as a
    // message.
    if (_.last(args) instanceof ConsoleOptions) {
      msgArgs = _.initial(args);
      opts = _.last(args).options;
    } else {
      msgArgs = args;
      opts = {};
    }
    var message = self._format(msgArgs);
    return { message: message, opts: opts };
  },

  isLevelEnabled: function (levelCode) {
    return (this.verbose || this._logThreshold <= levelCode);
  },

  isDebugEnabled: function () {
    return this.isLevelEnabled(LEVEL_CODE_DEBUG);
  },


  // Don't pretty-fy this output by trying to, for example, line-wrap it. Just
  // print it to the screen as it is.
  rawDebug: function(/*arguments*/) {
    var self = this;
    if (! self.isDebugEnabled()) {
      return;
    }

    var message = self._format(arguments);
    self._print(LEVEL_DEBUG, message);
  },

  // By default, Console.debug automatically line wrapps the output.
  //
  // Takes in an optional Console.options({}) argument at the end, with the
  // following keys:
  //   - bulletPoint: start the first line with a given string, then offset the
  //     subsequent lines by the length of that string. See _wrap for more details.
  //   - indent: offset the entire string by a specific number of
  //     characters. See _wrap for more details.
  //
  debug: function(/*arguments*/) {
    var self = this;
    if (! self.isDebugEnabled()) { return; }

    var parsedArgs = self._parseVariadicInput(arguments);
    var wrapOpts = {
      indent: parsedArgs.opts.indent,
      bulletPoint: parsedArgs.opts.bulletPoint
    };

    var wrappedMessage = self._wrapText(parsedArgs.message, wrapOpts);
    self._print(LEVEL_DEBUG, wrappedMessage);
  },

  isInfoEnabled: function () {
    return this.isLevelEnabled(LEVEL_CODE_INFO);
  },

  // Don't pretty-fy this output by trying to, for example, line-wrap it. Just
  // print it to the screen as it is.
  rawInfo: function(/*arguments*/) {
    var self = this;
    if (! self.isInfoEnabled()) {
      return;
    }

    var message = self._format(arguments);
    self._print(LEVEL_INFO, message);
  },

  // Generally, we want to process the output for legibility, for example, by
  // wrapping it. For raw output (ex: stack traces, user logs, etc), use the
  // rawInfo function. For more information about options, see: debug.
  info: function(/*arguments*/) {
    var self = this;
    if (! self.isInfoEnabled()) { return; }

    var parsedArgs = self._parseVariadicInput(arguments);
    var wrapOpts = {
      indent: parsedArgs.opts.indent,
      bulletPoint: parsedArgs.opts.bulletPoint
    };

    var wrappedMessage = self._wrapText(parsedArgs.message, wrapOpts);
    self._print(LEVEL_INFO, wrappedMessage);
  },

  isWarnEnabled: function () {
    return this.isLevelEnabled(LEVEL_CODE_WARN);
  },

  rawWarn: function(/*arguments*/) {
    var self = this;
    if (! self.isWarnEnabled()) {
      return;
    }

    var message = self._format(arguments);
    self._print(LEVEL_WARN, message);
  },

  // Generally, we want to process the output for legibility, for example, by
  // wrapping it. For raw output (ex: stack traces, user logs, etc), use the
  // rawWarn function. For more information about options, see: debug.
  warn: function(/*arguments*/) {
    var self = this;
    if (! self.isWarnEnabled()) { return; }

    var parsedArgs = self._parseVariadicInput(arguments);
    var wrapOpts = {
      indent: parsedArgs.opts.indent,
      bulletPoint: parsedArgs.opts.bulletPoint
    };

    var wrappedMessage = self._wrapText(parsedArgs.message, wrapOpts);
    self._print(LEVEL_WARN, wrappedMessage);
  },

  rawError: function(/*arguments*/) {
    var self = this;

    var message = self._format(arguments);
    self._print(LEVEL_ERROR, message);
  },

  // Generally, we want to process the output for legibility, for example, by
  // wrapping it. For raw output (ex: stack traces, user logs, etc), use the
  // rawWarn function. For more information about options, see: debug.
  error: function(/*arguments*/) {
    var self = this;

    var parsedArgs = self._parseVariadicInput(arguments);
    var wrapOpts = {
      indent: parsedArgs.opts.indent,
      bulletPoint: parsedArgs.opts.bulletPoint
    };

    var wrappedMessage = self._wrapText(parsedArgs.message, wrapOpts);
    self._print(LEVEL_ERROR, wrappedMessage);
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

    // XXX: Pause before showing the progress display, to prevent
    // flicker/spewing messages
    // Repaint the progress display
    progressDisplay.repaint();
  },

  // A wrapper around Console.info. Prints the message out in green (if pretty),
  // with the ascii checkmark as the bullet point in front of it.
  success: function (message) {
    var self = this;

    if (! self._pretty) {
      return self.info(message);
    }

    var checkmark = chalk.green('\u2713');
    return self.info(
        chalk.green(message),
        self.options({ bulletPoint: checkmark }));
  },

  // Wrapper around Console.info. Prints the message out in red (if pretty)
  // with the ascii x as the bullet point in front of it.
  failInfo: function (message) {
    var self = this;
    return self._fail(message, self.info);
  },

  // Wrapper around Console.warn. Prints the message out in red (if pretty)
  // with the ascii x as the bullet point in front of it.
  failWarn: function (message) {
    var self = this;
    return self._fail(message, self.warn);
  },

  // Print the message in red (if pretty) with an x bullet point in front of it.
  _fail: function (message, printFn) {
    var self = this;

    if (! self._pretty) {
      return printFn(message);
    }

    var xmark = chalk.red('\u2717');
    return printFn(
        chalk.red(message),
        self.options({ bulletPoint: xmark }));
  },

  // Wrapper around Console.warn that prints a large "WARNING" label in front.
  labelWarn: function (message) {
    var self = this;
    return self.warn(message, self.options({ bulletPoint: "WARNING" }));
  },

  // Wrappers around Console functions to prints an "=> " in front. Optional
  // indent to indent the arrow.
  arrowError: function (message, indent) {
    var self = this;
    return self._arrowPrint("error", message, indent);
  },
  arrowWarn: function (message, indent) {
    var self = this;
    return self._arrowPrint("warn", message, indent);
  },
  arrowInfo: function (message, indent) {
    var self = this;
    return self._arrowPrint("info", message, indent);
  },
  _arrowPrint: function(printFn, message, indent) {
    var self = this;
    indent = indent || 0;
    var myIndent = Array(indent + 1).join(" ");
    return self[printFn](
      message,
      self.options({ bulletPoint: myIndent + ARROW }));
  },

  // A wrapper around console.error. Given an error and some background
  // information, print out the correct set of messages depending on verbose
  // level, etc.
  printError: function (err, info) {
    var self = this;

    var message = err.message;
    if (! message) {
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
      self.rawInfo(err.stack);
    }
  },

  // A wrapper to print out buildmessage errors.
  printMessages: function (messages) {
    var self = this;

    if (messages.hasMessages()) {
      self.error("\n" + messages.formatMessages());
    }
  },

  // Wrap commands in this function -- it ensures that commands don't get line
  // wrapped (ie: print 'meteor' at the end of the line, and 'create --example'
  // at the beginning of the next one).
  //
  // To use, wrap commands that you send into print functions with this
  // function, like so: Console.info(text + Console.command("meteor create
  // --example leaderboard") + moretext).
  //
  // If pretty print is on, this will also bold the commands.
  command: function (message) {
    var self = this;
    var noBlanks =
          replaceAll(message, ' ', SPACE_REPLACEMENT);
    return this.bold(noBlanks);
  },

  // Underline the URLs (if pretty print is on).
  url: function (message) {
    return this.underline(message);
  },

  // A wrapper around the underline functionality of chalk.
  underline: function (message) {
    var self = this;

    if (! self._pretty) {
      return message;
    }
    return chalk.underline(message);
  },

  // A wrapper around the bold functionality of chalk.
  bold: function (message) {
    var self = this;

    if (! self._pretty) {
      return message;
    }
    return chalk.bold(message);
  },

  // Prints a two column table in a nice format:
  //  The first column is printed entirely, the second only as space permits
  printTwoColumns : function (rows, options) {
    var self = this;
    options = options || {};

    var longest = '';
    _.each(rows, function (row) {
      var col0 = row[0] || '';
      if (col0.length > longest.length)
        longest = col0;
    });

    var pad = longest.replace(/./g, ' ');
    var width = self.width();

    var out = '';
    _.each(rows, function (row) {
      var col0 = row[0] || '';
      var col1 = row[1] || '';
      var line = self.bold(col0) + pad.substr(col0.length);
      line += "  " + col1;
      if (line.length > width) {
        line = line.substr(0, width - 3) + '...';
      }
      out += line + "\n";
    });

    var level = options.level || self.LEVEL_INFO;
    self._print(level, out);

    return out;
  },

  // Format logs according to the spec in utils.
  _format: function (logArguments) {
    return util.format.apply(util, logArguments);
  },

  // Wraps long strings to the length of user's terminal. Inserts linebreaks
  // between words when nearing the end of the line. Returns the wrapped string
  // and takes the following arguments:
  //
  // text: the text to wrap
  // options:
  //   - bulletPoint: start the first line with a given string, then offset the
  //     subsequent lines by the length of that string. For example:
  //     " => some long message starts here
  //          and then continues here."
  //   - indent: offset the entire string by a specific number of
  //     characters. For example:
  //     "  This entire message is indented
  //        by two characters."
  //
  // Passing in both options will offset the bulletPoint by the indentation,
  // like so:
  //  "  this message is indented by two."
  //  "  => this mesage indented by two and
  //        and also starts with an arrow."
  //
  // When printing commands in-line, it is best to wrap commands in with Console.command
  // to make sure that they don't get line-wrapped. See Console.command for more details.
  _wrapText: function (text, options) {
    var self = this;
    options = options || {};

    // Compute the maximum offset on the bulk of the message.
    var maxIndent = 0;
    if (options.indent && options.indent > 0) {
      maxIndent = maxIndent + options.indent;
    }
    if (options.bulletPoint) {
      maxIndent = maxIndent + options.bulletPoint.length;
    }

    // Get the maximum width, or if we are not running in a terminal (self-test,
    // for exmaple), default to 80 columns.
    var max = self.width();

    // Wrap the text using the npm wordwrap library.
    var wrappedText = wordwrap(maxIndent, max)(text);

    // Insert the start string, if applicable.
    if (options.bulletPoint) {
      // Save the initial indent level.
      var initIndent = options.indent ?
          wrappedText.substring(0, options.indent) : "";
      // Add together the initial indent (if any), the bullet point and the
      // remainder of the message.
      wrappedText = initIndent + options.bulletPoint +
          wrappedText.substring(maxIndent);
    }

    // If we have previously replaces any spaces, now is the time to bring them
    // back.
    wrappedText = replaceAll(wrappedText, SPACE_REPLACEMENT, ' ');
    return wrappedText;
  },


  // Enables the progress bar, or disables it when called with (false)
  enableProgressDisplay: function (enabled) {
    var self = this;

    // No arg => enable
    if (enabled === undefined) {
      enabled = true;
    }

    if (self._progressDisplayEnabled === enabled)
      return;

    self._progressDisplayEnabled = enabled;
    self._updateProgressDisplay();
  },

  // In response to a change in setPretty or enableProgressDisplay,
  // configure the appropriate progressDisplay
  _updateProgressDisplay: function () {
    var self = this;

    var newProgressDisplay;

    if (! self._progressDisplayEnabled) {
      newProgressDisplay = new ProgressDisplayNone();
    } else if ((! self._stream.isTTY) || (! self._pretty)) {
      // No progress bar if not in pretty / on TTY.
      newProgressDisplay = new ProgressDisplayNone(self);
    } else if (self._stream.isTTY && ! self._stream.columns) {
      // We might be in a pseudo-TTY that doesn't support
      // clearLine() and cursorTo(...).
      // It's important that we only enter status message mode
      // if self._pretty, so that we don't start displaying
      // status messages too soon.
      // XXX See note where ProgressDisplayStatus is defined.
      newProgressDisplay = new ProgressDisplayStatus(self);
    } else {
      // Otherwise we can do the full progress bar
      newProgressDisplay = new ProgressDisplayFull(self);
    }

    // Start/stop the status poller, so we never block exit
    if (self._progressDisplayEnabled) {
      if (! self._statusPoller) {
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
