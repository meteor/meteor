var _ = require('underscore');
var isopackets = require('../tool-env/isopackets.js');
var Console = require('../console/console.js').Console;

// runLog is primarily used by the parts of the tool which run apps locally. It
// writes to standard output (and standard error, if rawLogs is set), and allows
// special output forms like "write this line, but let the next line overwrite
// it". It also makes its output available to the proxy, to be displayed to web
// browsers if the app fails to run.
//
// It's not the only mechanism used for gathering messages! buildmessage is a
// more structured way of gathering messages, but unlike log, it does not print
// messages immediately.
//
// Some other parts of the code (eg commands and warehouse) write directly to
// process.std{out,err} or to console.log; we should be careful to not do that
// anywhere that may overlap with use of runLog.


var getLoggingPackage = function () {
  var Log = isopackets.load('logging').logging.Log;

  // Since no other process will be listening to stdout and parsing it,
  // print directly in the same format as log messages from other apps
  Log.outputFormat = 'colored-text';

  return Log;
};

var RunLog = function () {
  var self = this;

  self.rawLogs = false;

  self.messages = []; // list of log objects
  self.maxLength = 100;

  // If non-null, the last thing logged was "server restarted"
  // message, and the value will be the number of consecutive such
  // messages that have been logged with no other intervening messages
  self.consecutiveRestartMessages = null;
  self.consecutiveClientRestartMessages = null;

  // If non-null, the last thing that was logged was a temporary
  // message (with a carriage return but no newline), and this is its
  // length.
  self.temporaryMessageLength = null;
};

_.extend(RunLog.prototype, {
  _record: function (msg) {
    var self = this;

    self.messages.push(msg);
    if (self.messages.length > self.maxLength) {
      self.messages.shift();
    }
  },

  _clearSpecial: function () {
    var self = this;

    if (self.consecutiveRestartMessages) {
      self.consecutiveRestartMessages = null;
      Console.info();
    }

    if (self.consecutiveClientRestartMessages) {
      self.consecutiveClientRestartMessages = null;
      Console.info();
    }

    if (self.temporaryMessageLength) {
      var spaces = new Array(self.temporaryMessageLength + 1).join(' ');
      process.stdout.write(spaces + Console.CARRIAGE_RETURN);
      self.temporaryMessageLength = null;
    }
  },

  setRawLogs: function (rawLogs) {
    this.rawLogs = !!rawLogs;
  },

  logAppOutput: function (line, isStderr) {
    var self = this;

    var Log = getLoggingPackage();

    var obj = (isStderr ?
               Log.objFromText(line, { level: 'warn', stderr: true }) :
               Log.parse(line) || Log.objFromText(line));
    self._record(obj);

    self._clearSpecial();
    if (self.rawLogs) {
      Console[isStderr ? "rawError" : "rawInfo"](line + "\n");
    } else {
      // XXX deal with test server logging differently?!
      Console.rawInfo(Log.format(obj, { color: true }) + "\n");
    }
  },

  // Log the message.
  //  msg: message
  //  options:
  //    - arrow: if true, preface with => and wrap accordingly.
  log: function (msg, options) {
    var self = this;
    options = options || {};
    var obj = {
      time: new Date,
      message: msg
      // in the future, might want to add something else to
      // distinguish messages from runner from message from the app,
      // but for now, nothing would use it, so we'll keep it simple
    };
    self._record(obj);

    self._clearSpecial();

    // Process the options. By default, we want to wordwrap the message with
    // Console.info. If we ask for raw output, then we don't want to do that. If
    // we ask for an arrow, we want to wrap around with => as the bulletPoint.
    Console[options.arrow ? 'arrowInfo' : 'info'](msg);
  },

  // Write a message to the terminal that will get overwritten by the
  // next message logged. (Don't put it in the log that getLog
  // returns.)
  // XXX Maybe this should return an object that you have to pass to the
  //     subsequent log call, and only such a log call will overwrite it (and an
  //     intervening log call will cause this to stay on the screen)?
  //     eg, a log call from the updater can interweave with the logTemporary
  //     calls in run-all.js
  logTemporary: function (msg) {
    var self = this;

    self._clearSpecial();
    process.stdout.write(msg + Console.CARRIAGE_RETURN);
    self.temporaryMessageLength = msg.length;
  },

  logRestart: function () {
    var self = this;

    if (self.consecutiveRestartMessages) {
      // replace old message in place. this assumes that the new restart message
      // is not shorter than the old one.
      process.stdout.write(Console.CARRIAGE_RETURN);
      self.messages.pop();
      self.consecutiveRestartMessages ++;
    } else {
      self._clearSpecial();
      self.consecutiveRestartMessages = 1;
    }

    var message = "=> Meteor server restarted";
    if (self.consecutiveRestartMessages > 1) {
      message += " (x" + self.consecutiveRestartMessages + ")";
    }
    // no newline, so that we can overwrite it if we get another
    // restart message right after this one
    process.stdout.write(message);

    self._record({
      time: new Date,
      message: message
    });
  },

  logClientRestart: function () {
    var self = this;

    if (self.consecutiveClientRestartMessages) {
      // replace old message in place. this assumes that the new restart message
      // is not shorter than the old one.
      process.stdout.write(Console.CARRIAGE_RETURN);
      self.messages.pop();
      self.consecutiveClientRestartMessages ++;
    } else {
      self._clearSpecial();
      self.consecutiveClientRestartMessages = 1;
    }

    var message = "=> Client modified -- refreshing";
    if (self.consecutiveClientRestartMessages > 1) {
      message += " (x" + self.consecutiveClientRestartMessages + ")";
    }
    // no newline, so that we can overwrite it if we get another
    // restart message right after this one
    process.stdout.write(message);

    self._record({
      time: new Date,
      message: message
    });
  },

  finish: function () {
    var self = this;

    self._clearSpecial();
  },

  clearLog: function () {
    var self = this;
    self.messages = [];
  },

  getLog: function () {
    var self = this;
    return self.messages;
  }
});

// Create a singleton instance of RunLog. Expose its public methods on the
// object you get with require('./run-log.js').
var runLogInstance = new RunLog;
_.each(
  ['log', 'logTemporary', 'logRestart', 'logClientRestart', 'logAppOutput',
   'setRawLogs', 'finish', 'clearLog', 'getLog'],
  function (method) {
    exports[method] = _.bind(runLogInstance[method], runLogInstance);
  });
