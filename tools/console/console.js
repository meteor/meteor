///  This class provides a set of utility functions for printing to the terminal
///  in the Meteor tool.
///
///  When you intend for your messages to be read by humans, you should use the
///  following functions to print to the terminal. They will automatically line
///  wrap output to either the width of the terminal, or 80 characters. They
///  will also end in a new line.
///
////   - Console.info : Print to stdout.
///    - Console.error: Print to stderr.
///    - Console.warn: Prints to stderr, if warnings are enabled.
///    - Console.debug: Prints to stdout, if debug is enabled.
///
/// Sometimes, there is a phrase that shouldn't be split up over multiple
/// lines (for example, 'meteor update'). When applicable, please use the
/// following functions (Some of them add aditional formatting, especially when
/// pretty-print is turned on):
///
///    - Console.command: things to enter on the command-line, such as
///      'meteor update' or 'cd foobar'.
///    - Console.url: URLs, such as 'www.meteor.com'
///    - Console.path: filepaths outside of Console.command.
///    - Console.noWrap: anything else that you don't want line-wrapped.
///
/// Here is a contrived example:
///   Console.info(
///     "For more information, please run", Console.command("meteor show"),
///     "or check out the new releases at", Console.url("www.meteor.com"),
///     "or look at", Console.path(filepath), ". You are currently running",
///     "Console.noWrap("Meteor version 1.5") + ".");
///
/// The Console.info/Console.error/Console.warn/Console.debug functions also
/// take in Console.options, as a last (optional) argument. These allow you to
/// set an indent or use a bulletpoint. You can check out their API below. If
/// possible, you might also want to use one of the existing wrapper functions,
/// such as Console.labelWarning or Console.arrowInfo.
///
/// Output intended for machines (or pre-formatted in specific ways) should NOT
/// be line-wrapped. Do not wrap these things: JSON output, error stack traces,
/// logs from other programs, etc. For those, you should use the 'raw'
/// version of the API:
///
///    - Console.rawInfo: Like Console.info, but without formatting.
///    - Console.rawError: Like Console.error, but without formatting.
///    - Console.rawWarn: Like Console.warn, but without formatting.
///    - Console.rawDebug: Like Console.debug, but without formatting.
///
/// DO NOT use Console.command/Console.url/Console.path with the raw functions!
/// (They will change your output in ways that you probably do not want). These
/// don't auto-linewrap, end in a newline, or take in Console.options.
///
/// Here is are some examples:
///     Console.rawInfo(JSON.stringify(myData, null, 2));
///     Console.rawError(err.stack + "\n");
///
/// In addition to printing functions, the Console class provides progress bar
/// support, that is mostly handled through buildmessage.js.
import { createInterface } from "readline";
import { format as utilFormat }  from "util";
import { getRootProgress } from "../utils/buildmessage.js";
// XXX: Are we happy with chalk (and its sub-dependencies)?
import chalk from "chalk";
import { onExit as cleanupOnExit } from "../tool-env/cleanup.js";
import wordwrap from "wordwrap";
import {
  isEmacs,
  sleepMs,
  Throttled,
  ThrottledYield,
} from "../utils/utils.js";

const PROGRESS_DEBUG = !!process.env.METEOR_PROGRESS_DEBUG;
// Set the default CR to \r unless we're running with cmd
const CARRIAGE_RETURN = process.platform === 'win32' &&
      process.stdout.isTTY &&
      process.argv[1].toLowerCase().includes('cmd') ? new Array(249).join('\b') : '\r';

const FORCE_PRETTY = process.env.METEOR_PRETTY_OUTPUT &&
  process.env.METEOR_PRETTY_OUTPUT != '0';

if (! process.env.METEOR_COLOR) {
  chalk.enabled = false;
}

const STATUS_MAX_LENGTH = 40;

const PROGRESS_MAX_WIDTH = 40;
const PROGRESS_BAR_FORMAT = '[:bar] :percent :etas';
const TEMP_STATUS_LENGTH = STATUS_MAX_LENGTH + 12;

const STATUS_INTERVAL_MS = 50;
const PROGRESS_THROTTLE_MS = 300;

// Message to show when we don't know what we're doing
// XXX: ? FALLBACK_STATUS = 'Pondering';
const FALLBACK_STATUS = '';

// If there is a part of the larger text, and we really want to make sure that
// it doesn't get split up, we will replace the space with a utf character that
// we are not likely to use anywhere else. This one looks like the a BLACK SUN
// WITH RAYS. We intentionally want to NOT use a space-like character: it should
// be obvious that something has gone wrong if this ever gets printed.
const SPACE_REPLACEMENT = '\u2600';
// In Javascript, replace only replaces the first occurance and this is the
// proposed alternative.
const replaceAll = (str, search, replace) => str.split(search).join(replace);

let spacesArray = new Array(200).join(' ');
const spacesString = (length) => {
  if (length > spacesArray.length) {
    spacesArray = new Array(length * 2).join(' ');
  }
  return spacesArray.substring(0, length);
};
const ARROW = "=> ";


const toFixedLength = (text, length) => {
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
class ProgressDisplayNone {
  depaint() {
    // No-op
  }

  repaint() {
    // No-op
  }
}

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
class ProgressDisplayStatus {
  constructor(console) {
    this._console = console;
    this._stream = console._stream;

    this._status = null;
    this._wroteStatusMessage = false;
  }

  depaint() {
    // For the non-progress-bar status mode, we may need to
    // clear some characters that we printed with a trailing `\r`.
    if (this._wroteStatusMessage) {
      var spaces = spacesString(TEMP_STATUS_LENGTH + 1);
      this._stream.write(spaces + CARRIAGE_RETURN);
      this._wroteStatusMessage = false;
    }
  }

  repaint() {
    // We don't repaint after a log message (is that right?)
  }

  updateStatus(status) {
    if (status == this._status) {
      return;
    }

    this._status = status;
    this._render();
  }

  _render() {
    var text = this._status;
    if (text) {
      text = toFixedLength(text, STATUS_MAX_LENGTH);
    }

    if (text) {
      // the number of characters besides `text` here must
      // be accounted for in TEMP_STATUS_LENGTH.
      this._stream.write('  (  ' + text + '  ... )' + CARRIAGE_RETURN);
      this._wroteStatusMessage = true;
    }
  }
}

class SpinnerRenderer {
  constructor() {
    this.frames = ['-', '\\', '|', '/'];
    this.start = +(new Date);
    this.interval = 250;
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
  }

  asString() {
    var now = +(new Date);

    var t = now - this.start;
    var frame = Math.floor(t / this.interval) % this.frames.length;
    return this.frames[frame];
  }
}

// Renders a progressbar.  Based on the npm 'progress' module, but tailored to our needs (i.e. renders to string)
class ProgressBarRenderer {
  constructor(format, options) {
    options = options || Object.create(null);

    this.fmt = format;
    this.curr = 0;
    this.total = 100;
    this.maxWidth = options.maxWidth || this.total;
    this.chars = {
      complete   : '=',
      incomplete : ' '
    };
  }

  asString(availableSpace) {
    var ratio = this.curr / this.total;
    ratio = Math.min(Math.max(ratio, 0), 1);

    var percent = ratio * 100;
    var incomplete, complete, completeLength;
    var elapsed = new Date - this.start;
    var eta = (percent == 100) ? 0 : elapsed * (this.total / this.curr - 1);

    /* populate the bar template with percentages and timestamps */
    var str = this.fmt
      .replace(':current', this.curr)
      .replace(':total', this.total)
      .replace(':elapsed', isNaN(elapsed) ? '0.0' : (elapsed / 1000).toFixed(1))
      .replace(':eta', (isNaN(eta) || ! isFinite(eta)) ? '0.0' : (eta / 1000).toFixed(1))
      .replace(':percent', percent.toFixed(0) + '%');

    /* compute the available space (non-zero) for the bar */
    var width = Math.min(this.maxWidth, availableSpace - str.replace(':bar', '').length);

    /* NOTE: the following assumes the user has one ':bar' token */
    completeLength = Math.round(width * ratio);
    complete = Array(completeLength + 1).join(this.chars.complete);
    incomplete = Array(width - completeLength + 1).join(this.chars.incomplete);

    /* fill in the actual progress bar */
    str = str.replace(':bar', complete + incomplete);

    return str;
  }
}


class ProgressDisplayFull {
  constructor(console) {
    this._console = console;
    this._stream = console._stream;

    this._status = '';

    var options = {
      complete: '=',
      incomplete: ' ',
      maxWidth: PROGRESS_MAX_WIDTH,
      total: 100
    };
    this._progressBarRenderer = new ProgressBarRenderer(PROGRESS_BAR_FORMAT, options);
    this._progressBarRenderer.start = new Date();

    this._headless = !! (
      process.env.METEOR_HEADLESS &&
      JSON.parse(process.env.METEOR_HEADLESS)
    );

    this._spinnerRenderer = new SpinnerRenderer();

    this._fraction = undefined;

    this._printedLength = 0;

    this._lastWrittenLine = null;
    this._lastWrittenTime = 0;
    this._renderTimeout = null;
  }

  depaint() {
    this._clearDelayedRender();
    this._stream.write(spacesString(this._printedLength) + CARRIAGE_RETURN);
  }

  updateStatus(status) {
    if (status == this._status) {
      return;
    }

    this._status = status;
    this._render();
  }

  updateProgress(fraction, startTime) {
    this._fraction = fraction;
    if (fraction !== undefined) {
      this._progressBarRenderer.curr = Math.floor(fraction * this._progressBarRenderer.total);
    }
    if (startTime) {
      this._progressBarRenderer.start = startTime;
    }

    if (!this._renderTimeout && this._lastWrittenTime) {
      this._rerenderTimeout = setTimeout(() => {
        this._rerenderTimeout = null;
        this._render()
      }, PROGRESS_THROTTLE_MS);
    } else if (this._lastWrittenTime === 0) {
      this._render();
    }
  }

  repaint() {
    this._render();
  }

  setHeadless(headless) {
    this._headless = !! headless;
  }

  _clearDelayedRender() {
    if (this._rerenderTimeout) {
      clearTimeout(this._rerenderTimeout);
      this._rerenderTimeout = null;
    }
  }

  _render() {
    if (this._rerenderTimeout) {
      this._clearDelayedRender();
    }

    // XXX: Or maybe just jump to the correct position?
    var progressGraphic = '';

    // The cursor appears in position 0; we indent it a little to avoid this
    // This also means it appears less important, which is good
    var indentColumns = 3;

    var streamColumns = this._console.width();
    var statusColumns;
    var progressColumns;
    if (! streamColumns) {
      statusColumns = STATUS_MAX_LENGTH;
      progressColumns = 0;
    } else {
      statusColumns = Math.min(STATUS_MAX_LENGTH, streamColumns - indentColumns);
      progressColumns = Math.min(PROGRESS_MAX_WIDTH, streamColumns - indentColumns - statusColumns);
    }

    if (this._fraction !== undefined && progressColumns > 16) {
      // 16 is a heuristic number that allows enough space for a meaningful progress bar
      progressGraphic = "  " + this._progressBarRenderer.asString(progressColumns - 2);

    } else if (! this._headless && progressColumns > 3) {
      // 3 = 2 spaces + 1 spinner character
      progressGraphic = "  " + this._spinnerRenderer.asString();

    } else if (new Date - this._lastWrittenTime > 5 * 60 * 1000) {
      // Print something every five minutes, to avoid test timeouts.
      progressGraphic = "  [ProgressDisplayFull keepalive]";
      this._lastWrittenLine = null; // Force printing.
    }

    if (this._status || progressGraphic) {
      // XXX: Just update the graphic, to avoid text flicker?

      var line = spacesString(indentColumns);
      var length = indentColumns;

      if (this._status) {
        var fixedLength = toFixedLength(this._status, statusColumns);
        line += chalk.bold(fixedLength);
        length += statusColumns;
      } else {
        line += spacesString(statusColumns);
        length += statusColumns;
      }

      line += progressGraphic + CARRIAGE_RETURN;
      length += progressGraphic.length;

      if (this._headless &&
          line === this._lastWrittenLine) {
        // Don't write the exact same line twice in a row.
        return;
      }

      this.depaint();

      this._stream.write(line);
      this._lastWrittenLine = line;
      this._lastWrittenTime = +new Date;
      this._printedLength = length;
    }
  }
}

class StatusPoller {
  constructor(console) {
    // The current progress we are watching
    this._watching = null;

    this._console = console;

    this._pollPromise = null;
    this._throttledStatusPoll = new Throttled({
      interval: STATUS_INTERVAL_MS
    });
    this._startPoller();
    this._stop = false;
  }

  _startPoller() {
    if (this._pollPromise) {
      throw new Error("Already started");
    }

    this._pollPromise = (async() => {
      sleepMs(STATUS_INTERVAL_MS);
      while (! this._stop) {
        this.statusPoll();
        sleepMs(STATUS_INTERVAL_MS);
      }
    })();
  }

  stop() {
    this._stop = true;
  }

  statusPoll() {
    if (this._throttledStatusPoll.isAllowed()) {
      this._statusPoll();
    }
  }

  _statusPoll() {
    // XXX: Early exit here if we're not showing status at all?

    var rootProgress = getRootProgress();
    if (PROGRESS_DEBUG) {
      // It can be handy for dev purposes to see all the executing tasks
      rootProgress.dump(process.stdout, {skipDone: true});
    }

    const reportState = (state, startTime) => {
      var progressDisplay = this._console._progressDisplay;
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

    if (this._watching === watching) {
      // We need to do this to keep the spinner spinning
      // XXX: Should we _only_ do this when we're showing the spinner?
      reportState(watching.getState(), watching.startTime);
      return;
    }

    this._watching = watching;

    var title = (watching != null ? watching._title : null) || FALLBACK_STATUS;

    var progressDisplay = this._console._progressDisplay;
    progressDisplay.updateStatus && progressDisplay.updateStatus(title);

    if (watching) {
      watching.addWatcher((state) => {
        if (watching != this._watching) {
          // No longer active
          // XXX: De-register with watching? (we don't bother right now because dead tasks tell no status)
          return;
        }

        reportState(state, watching.startTime);
      });
    }
  }
}

// We use a special class to represent the options that we send to the Console
// because it allows us to call 'instance of' on the last argument of variadic
// functions. This allows us to keep the signature of our custom output
// functions (ex: info) roughly the same as the originals.
class ConsoleOptions {
  constructor(o) {
    this.options = o;
  }
}

const LEVEL_CODE_ERROR = 4;
const LEVEL_CODE_WARN = 3;
const LEVEL_CODE_INFO = 2;
const LEVEL_CODE_DEBUG = 1;

export const LEVEL_ERROR = { code: LEVEL_CODE_ERROR };
export const LEVEL_WARN = { code: LEVEL_CODE_WARN };
export const LEVEL_INFO = { code: LEVEL_CODE_INFO };
export const LEVEL_DEBUG = { code: LEVEL_CODE_DEBUG };

// This base class is just here to preserve some of the "static properties"
// which were being set on the `Console.prototype` prior to this being a
// `class`.  In the future, if static properties eventually work their way
// into the language, this can be moved into the `Console` class.
class ConsoleBase {}
Object.assign(ConsoleBase.prototype, {
  // Log levels
  LEVEL_ERROR,
  LEVEL_WARN,
  LEVEL_INFO,
  LEVEL_DEBUG,

  // Other Console constants.
  CARRIAGE_RETURN,
});

class Console extends ConsoleBase {
  constructor(options) {
    super();

    options = options || Object.create(null);

    this._headless = !! (
      process.env.METEOR_HEADLESS &&
      JSON.parse(process.env.METEOR_HEADLESS)
    );

    // The progress display we are showing on-screen
    this._progressDisplay = new ProgressDisplayNone(this);

    this._statusPoller = null;

    this._throttledYield = new ThrottledYield();

    this.verbose = false;

    // Legacy helpers
    this.stdout = Object.create(null);
    this.stderr = Object.create(null);

    this._stream = process.stdout;

    this._pretty = (FORCE_PRETTY !== undefined ? FORCE_PRETTY : false);
    this._progressDisplayEnabled = false;

    this._logThreshold = LEVEL_CODE_INFO;
    var logspec = process.env.METEOR_LOG;
    if (logspec) {
      logspec = logspec.trim().toLowerCase();
      if (logspec == 'debug') {
        this._logThreshold = LEVEL_CODE_DEBUG;
      }
    }

    cleanupOnExit((sig) => {
      this.enableProgressDisplay(false);
    });
  }

  setPretty(pretty) {
    // If we're being forced, do nothing.
    if (FORCE_PRETTY !== undefined) {
      return;
    }
    // If no change, do nothing.
    if (this._pretty === pretty) {
      return;
    }
    this._pretty = pretty;
    this._updateProgressDisplay();
  }

  // Runs f with the progress display visible (ie, with progress display enabled
  // and pretty). Resets both flags to their original values after f runs.
  withProgressDisplayVisible(f) {
    var originalPretty = this._pretty;
    var originalProgressDisplayEnabled = this._progressDisplayEnabled;

    // Turn both flags on.
    this._pretty = this._progressDisplayEnabled = true;

    // Update the screen if anything changed.
    if (! originalPretty || ! originalProgressDisplayEnabled) {
      this._updateProgressDisplay();
    }

    try {
      return f();
    } finally {
      // Reset the flags.
      this._pretty = originalPretty;
      this._progressDisplayEnabled = originalProgressDisplayEnabled;
      // Update the screen if anything changed.
      if (! originalPretty || ! originalProgressDisplayEnabled) {
        this._updateProgressDisplay();
      }
    }
  }

  setVerbose(verbose) {
    this.verbose = verbose;
  }

  // Get the current width of the Console.
  width() {
    var width = 80;
    var stream = process.stdout;
    if (stream && stream.isTTY && stream.columns) {
      width = stream.columns;
    }

    // On Windows cmd.exe splits long lines into smaller chunks by inserting the
    // '\r\n' symbols into the stream, this is what cmd.exe does instead of
    // reflowing the text. We cannot control it. For some unknown reason, even
    // when the output line is less than number of columns (usually 80), cmd.exe
    // would still insert new-line chars. These chars break our repainting that
    // relies on the previous chars to be erasable with '\b' (end-line chars
    // can't be erased this way). This is why we report a smaller number than it
    // is in reality, for safety.
    if (process.platform === 'win32') {
      width -= 5;
    }

    return width;
  }

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
  nudge(canYield) {
    if (this._statusPoller) {
      this._statusPoller.statusPoll();
    }
    if (canYield === undefined || canYield === true) {
      this._throttledYield.yield();
    }
  }

  // Initializes and returns a new ConsoleOptions object. Takes in the following
  // Console options to pass to _wrapText eventually.
  //
  //   - bulletPoint: start the first line with a given string, then offset the
  //     subsequent lines by the length of that string. For example, if the
  //     bulletpoint is " => ", we would get:
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
  options(o) {
    // (This design pattern allows us to call 'instance of' on the
    // ConsoleOptions in parseVariadicInput, by ensuring that the object created
    // with Console.options is, in fact, a new object.
    return new ConsoleOptions(o);
  }

  // Deal with the arguments to a variadic print function that also takes an
  // optional ConsoleOptions argument at the end.
  //
  // Returns an object with keys:
  //  - options: The options that were passed in, or an empty object.
  //  - message: Arguments to the original function, parsed as a string.
  //
  _parseVariadicInput(args) {
    var msgArgs;
    var options;
    // If the last argument is an instance of ConsoleOptions, then we should
    // separate it out, and only send the first N-1 arguments to be parsed as a
    // message.
    const lastArg = args && args.length && args[args.length - 1];
    if (lastArg instanceof ConsoleOptions) {
      msgArgs = args.slice(0, -1);
      options = lastArg.options;
    } else {
      msgArgs = args;
      options = Object.create(null);
    }
    var message = this._format(msgArgs);
    return { message: message, options: options };
  }

  isLevelEnabled(levelCode) {
    return (this.verbose || this._logThreshold <= levelCode);
  }

  isDebugEnabled() {
    return this.isLevelEnabled(LEVEL_CODE_DEBUG);
  }


  // Don't pretty-fy this output by trying to, for example, line-wrap it. Just
  // print it to the screen as it is.
  rawDebug(...args) {
    if (! this.isDebugEnabled()) {
      return;
    }

    var message = this._format(args);
    this._print(LEVEL_DEBUG, message);
  }

  // By default, Console.debug automatically line wraps the output.
  //
  // Takes in an optional Console.options({}) argument at the end, with the
  // following keys:
  //   - bulletPoint: start the first line with a given string, then offset the
  //     subsequent lines by the length of that string. See _wrap for more details.
  //   - indent: offset the entire string by a specific number of
  //     characters. See _wrap for more details.
  //
  debug(...args) {
    if (! this.isDebugEnabled()) { return; }

    var message = this._prettifyMessage(args);
    this._print(LEVEL_DEBUG, message);
  }

  isInfoEnabled() {
    return this.isLevelEnabled(LEVEL_CODE_INFO);
  }

  // Don't pretty-fy this output by trying to, for example, line-wrap it. Just
  // print it to the screen as it is.
  rawInfo(...args) {
    if (! this.isInfoEnabled()) {
      return;
    }

    var message = this._format(args);
    this._print(LEVEL_INFO, message);
  }

  // Generally, we want to process the output for legibility, for example, by
  // wrapping it. For raw output (ex: stack traces, user logs, etc), use the
  // rawInfo function. For more information about options, see: debug.
  info(...args) {
    if (! this.isInfoEnabled()) { return; }

    var message = this._prettifyMessage(args);
    this._print(LEVEL_INFO, message);
  }

  isWarnEnabled() {
    return this.isLevelEnabled(LEVEL_CODE_WARN);
  }

  rawWarn(...args) {
    if (! this.isWarnEnabled()) {
      return;
    }

    var message = this._format(args);
    this._print(LEVEL_WARN, message);
  }

  // Generally, we want to process the output for legibility, for example, by
  // wrapping it. For raw output (ex: stack traces, user logs, etc), use the
  // rawWarn function. For more information about options, see: debug.
  warn(...args) {
    if (! this.isWarnEnabled()) { return; }

    var message = this._prettifyMessage(args);
    this._print(LEVEL_WARN, message);
  }

  rawError(...args) {
    var message = this._format(args);
    this._print(LEVEL_ERROR, message);
  }

  // Generally, we want to process the output for legibility, for example, by
  // wrapping it. For raw output (ex: stack traces, user logs, etc), use the
  // rawError function. For more information about options, see: debug.
  error(...args) {
    var message = this._prettifyMessage(args);
    this._print(LEVEL_ERROR, message);
  }

  // Prints a special ANSI sequence that "clears" the screen (on most terminal
  // emulators just scrolls the contents down and resets the position).
  // References: http://en.wikipedia.org/wiki/ANSI_escape_code#CSI_codes
  clear() {
    this.rawInfo('\u001b[2J\u001b[0;0H');
  }

  _prettifyMessage(msgArguments) {
    var parsedArgs = this._parseVariadicInput(msgArguments);
    var wrapOpts = {
      indent: parsedArgs.options.indent,
      bulletPoint: parsedArgs.options.bulletPoint
    };

    var wrappedMessage = this._wrapText(parsedArgs.message, wrapOpts);
    wrappedMessage += "\n";
    return wrappedMessage;
  }

  _print(level, message) {
    // We need to hide the progress bar/spinner before printing the message
    var progressDisplay = this._progressDisplay;
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
    if (level && this._pretty) {
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
      dest.write(style(message));
    } else {
      dest.write(message);
    }

    // XXX: Pause before showing the progress display, to prevent
    // flicker/spewing messages
    // Repaint the progress display
    progressDisplay.repaint();
  }

  // A wrapper around Console.info. Prints the message out in green (if pretty),
  // with the CHECKMARK as the bullet point in front of it.
  success(message, uglySuccessKeyword = "success") {
    var checkmark;

    if (! this._pretty) {
      return this.info(`${message}: ${uglySuccessKeyword}`);
    }

    if (process.platform === "win32") {
      checkmark = chalk.green('SUCCESS');
    } else {
      checkmark = chalk.green('\u2713'); // CHECKMARK
    }

    return this.info(
        chalk.green(message),
        this.options({ bulletPoint: checkmark  + " "}));
  }

  // Wrapper around Console.info. Prints the message out in red (if pretty)
  // with the BALLOT X as the bullet point in front of it.
  failInfo(message) {
    return this._fail(message, "info");
  }

  // Wrapper around Console.warn. Prints the message out in red (if pretty)
  // with the ascii x as the bullet point in front of it.
  failWarn(message) {
    return this._fail(message, "warn");
  }

  // Print the message in red (if pretty) with an x bullet point in front of it.
  _fail(message, printFn) {
    if (! this._pretty) {
      return this[printFn](message);
    }

    var xmark = chalk.red('\u2717');
    return this[printFn](
        chalk.red(message),
        this.options({ bulletPoint: xmark + " " }));
  }

  // Wrapper around Console.warn that prints a large "WARNING" label in front.
  labelWarn(message) {
    return this.warn(message, this.options({ bulletPoint: "WARNING: " }));
  }

  // Wrappers around Console functions to prints an "=> " in front. Optional
  // indent to indent the arrow.
  arrowError(message, indent) {
    return this._arrowPrint("error", message, indent);
  }
  arrowWarn(message, indent) {
    return this._arrowPrint("warn", message, indent);
  }
  arrowInfo(message, indent) {
    return this._arrowPrint("info", message, indent);
  }
  _arrowPrint(printFn, message, indent) {
    indent = indent || 0;
    return this[printFn](
      message,
      this.options({ bulletPoint: ARROW, indent: indent }));
  }

  // A wrapper around console.error. Given an error and some background
  // information, print out the correct set of messages depending on verbose
  // level, etc.
  printError(err, info) {
    var message = err.message;
    if (! message) {
      message = "Unexpected error";
      if (this.verbose) {
        message += " (" + err.toString() + ")";
      }
    }

    if (info) {
      message = info + ": " + message;
    }

    this.error(message);
    if (this.verbose && err.stack) {
      this.rawInfo(err.stack + "\n");
    }
  }

  // A wrapper to print out buildmessage errors.
  printMessages(messages) {
    if (messages.hasMessages()) {
      this.error("\n" + messages.formatMessages());
    }
  }

  // Wrap commands in this function -- it ensures that commands don't get line
  // wrapped (ie: print 'meteor' at the end of the line, and 'create --example'
  // at the beginning of the next one).
  //
  // To use, wrap commands that you send into print functions with this
  // function, like so: Console.info(text + Console.command("meteor create
  // --example leaderboard") + moretext).
  //
  // If pretty print is on, this will also bold the commands.
  command(message) {
    var unwrapped = this.noWrap(message);
    return this.bold(unwrapped);
  }

  // Underline the URLs (if pretty print is on).
  url(message) {
    // If we are going to print URLs with spaces, we should turn spaces into
    // things browsers understand.
    var unspaced =
          replaceAll(message, ' ', '%20');
    // There is no need to call noWrap here, since that only handles spaces (and
    // we have done that). If it ever handles things other than spaces, we
    // should make sure to call it here.
    return this.underline(unspaced);
  }

  // Format a filepath to not wrap. This does NOT automatically escape spaces
  // (ie: add a slash in front so the user could copy paste the file path into a
  // terminal).
  path(message) {
    // Make sure that we don't wrap this.
    var unwrapped = this.noWrap(message);
    return this.bold(unwrapped);
  }

  // Do not wrap this substring when you send it into a non-raw print function.
  // DO NOT print the result of this call with a raw function.
  noWrap(message) {
    var noBlanks = replaceAll(message, ' ', SPACE_REPLACEMENT);
    return noBlanks;
  }

  // A wrapper around the underline functionality of chalk.
  underline(message) {
    if (! this._pretty) {
      return message;
    }
    return chalk.underline(message);
  }

  // A wrapper around the bold functionality of chalk.
  bold(message) {
    if (! this._pretty) {
      return message;
    }
    return chalk.bold(message);
  }

  // Prints a two column table in a nice format (The first column is printed
  // entirely, the second only as space permits).
  //  options:
  //      - level: Allows to print to stderr, instead of stdout. Set the print
  //        level with Console.LEVEL_INFO, Console.LEVEL_ERROR, etc.
  //      - ignoreWidth: ignore the width of the terminal, and go over the
  //        character limit instead of trailing off with '...'. Useful for
  //        printing directories, for examle.
  //      - indent: indent the entire table by a given number of spaces.
  printTwoColumns(rows, options) {
    options = options || Object.create(null);

    var longest = '';
    rows.forEach(row => {
      var col0 = row[0] || '';
      if (col0.length > longest.length) {
        longest = col0;
      }
    });

    var pad = longest.replace(/./g, ' ');
    var width = this.width();
    var indent =
      options.indent ? Array(options.indent + 1).join(' ') : "";

    var out = '';
    rows.forEach(row => {
      var col0 = row[0] || '';
      var col1 = row[1] || '';
      var line = indent + this.bold(col0) + pad.substr(col0.length);
      line += "  " + col1;
      if (! options.ignoreWidth && line.length > width) {
        line = line.substr(0, width - 3) + '...';
      }
      out += line + "\n";
    });

    var level = options.level || this.LEVEL_INFO;
    out += "\n";
    this._print(level, out);

    return out;
  }

  // Format logs according to the spec in utils.
  _format(logArguments) {
    return utilFormat(...logArguments);
  }

  // Wraps long strings to the length of user's terminal. Inserts linebreaks
  // between words when nearing the end of the line. Returns the wrapped string
  // and takes the following arguments:
  //
  // text: the text to wrap
  // options:
  //   - bulletPoint: (see: Console.options)
  //   - indent: (see: Console.options)
  //
  _wrapText(text, options) {
    options = options || Object.create(null);

    // Compute the maximum offset on the bulk of the message.
    var maxIndent = 0;
    if (options.indent && options.indent > 0) {
      maxIndent = maxIndent + options.indent;
    }
    if (options.bulletPoint) {
      maxIndent = maxIndent + options.bulletPoint.length;
    }

    // Get the maximum width, or if we are not running in a terminal (self-test,
    // for example), default to 80 columns.
    var max = this.width();

    var wrappedText;
    if (process.env.METEOR_NO_WORDWRAP) {
      var indent =
        options.indent ? Array(options.indent + 1).join(' ') : "";
      if (options.bulletPoint) {
        wrappedText = options.bulletPoint + text;
      } else {
        wrappedText = text;
      }
      wrappedText = wrappedText.split('\n').map(s => {
        if (s === "") {
          return "";
        }
        return indent + s;
      }).join('\n');

    } else {
      // Wrap the text using the npm wordwrap library.
      wrappedText = wordwrap(maxIndent, max)(text);

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
    }

    // If we have previously replaces any spaces, now is the time to bring them
    // back.
    wrappedText = replaceAll(wrappedText, SPACE_REPLACEMENT, ' ');
    return wrappedText;
  }


  // Enables the progress bar, or disables it when called with (false)
  enableProgressDisplay(enabled) {
    // No arg => enable
    if (enabled === undefined) {
      enabled = true;
    }

    if (this._progressDisplayEnabled === enabled) {
      return;
    }

    this._progressDisplayEnabled = enabled;
    this._updateProgressDisplay();
  }

  // In response to a change in setPretty or enableProgressDisplay,
  // configure the appropriate progressDisplay
  _updateProgressDisplay() {
    var newProgressDisplay;

    if (! this._progressDisplayEnabled) {
      newProgressDisplay = new ProgressDisplayNone();
    } else if ((! this._stream.isTTY) || (! this._pretty)) {
      // No progress bar if not in pretty / on TTY.
      newProgressDisplay = new ProgressDisplayNone(this);
    } else if (isEmacs() || this.isPseudoTTY()) {
      // Resort to a more basic mode if we're in an environment which
      // misbehaves when using clearLine() and cursorTo(...).
      newProgressDisplay = new ProgressDisplayStatus(this);
    } else {
      // Otherwise we can do the full progress bar
      newProgressDisplay = new ProgressDisplayFull(this);
    }

    // Start/stop the status poller, so we never block exit
    if (this._progressDisplayEnabled) {
      if (! this._statusPoller) {
        this._statusPoller = new StatusPoller(this);
      }
    } else {
      if (this._statusPoller) {
        this._statusPoller.stop();
        this._statusPoller = null;
      }
    }

    this._setProgressDisplay(newProgressDisplay);
  }

  isPseudoTTY() {
    return this._stream && this._stream.isTTY && ! this._stream.columns;
  }

  isHeadless() {
    return this._headless;
  }

  isInteractive() {
    return ! this._headless;
  }

  setHeadless(headless = true) {
    this._headless = !! headless;

    if (this._progressDisplay &&
        this._progressDisplay.setHeadless) {
      this._progressDisplay.setHeadless(this._headless);
    }
  }

  _setProgressDisplay(newProgressDisplay) {
    // XXX: Optimize case of no-op transitions? (same mode -> same mode)

    var oldProgressDisplay = this._progressDisplay;
    oldProgressDisplay.depaint();

    this._progressDisplay = newProgressDisplay;
  }

  // options:
  //   - echo (boolean): defaults to true
  //   - prompt (string)
  //   - stream: defaults to process.stdout (you might want process.stderr)
  readLine(options) {
    options = Object.assign(Object.create(null), {
      echo: true,
      stream: this._stream
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

    var previousProgressDisplay = this._progressDisplay;
    this._setProgressDisplay(new ProgressDisplayNone());

    // Read a line, throwing away the echoed characters into our dummy stream.
    var rl = createInterface({
      input: process.stdin,
      output: options.echo ? options.stream : silentStream,
      // `terminal: options.stream.isTTY` is the default, but emacs shell users
      // don't want fancy ANSI.
      terminal: options.stream.isTTY && ! isEmacs()
    });

    if (! options.echo) {
      options.stream.write(options.prompt);
    } else {
      rl.setPrompt(options.prompt);
      rl.prompt();
    }

    return new Promise((resolve) => {
      rl.on('line', line => {
        rl.close();
        if (! options.echo) {
          options.stream.write("\n");
        }
        this._setProgressDisplay(previousProgressDisplay);
        resolve(line);
      });
    }).await();
  }
}

exports.Console = new Console;
