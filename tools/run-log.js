var _ = require('underscore');
var unipackage = require('./unipackage.js');

var getLoggingPackage = _.once(function () {
  var Log = unipackage.load({
    library: release.current.library,
    packages: ['logging']
  }).logging.Log;

  // Since no other process will be listening to stdout and parsing it,
  // print directly in the same format as log messages from other apps
  Log.outputFormat = 'colored-text';

  return Log;
});

// options: rawLogs
var RunLog = function (options) {
  var self = this;

  self.rawLogs = options.rawLogs;

  self.messages = []; // list of log objects
  self.maxLength = 100;

  // If non-null, the last thing logged was "server restarted"
  // message, and teh value will be the number of consecutive such
  // messages that have been logged with no other intervening messages
  self.consecutiveRestartMessages = null;
};

_.extend(RunLog.prototype, {
  _record: function (msg) {
    var self = this;

    self.messages.push(msg);
    if (self.messages.length > self.maxLength) {
      self.messages.shift();
    }
  },

  logAppOutput: function (line, isStderr) {
    if (line.trim().length === 0)
      return;

    var Log = getLoggingPackage();

    var obj = (isStderr ?
               Log.objFromText(line, { level: 'warn', stderr: true }) :
               Log.parse(line) || Log.objFromText(line));
    self._record(obj);

    if (self.consecutiveRestartMessages) {
      self.consecutiveRestartMessages = null;
      process.stdout.write("\n");
    }

    if (self.rawLogs)
      process[isStderr ? "stderr" : "stdout"].write(line + "\n");
    else
      process.stdout.write(Log.format(obj, { color: true }) + "\n");

    // XXX deal with test server logging differently?!
  },

  log: function (msg) {
    var self = this;

    var obj = {
      time: new Date,
      message: msg
      // in the future, might want to add something else to
      // distinguish messages from runner from message from the app,
      // but for now, nothing would use it, so we'll keep it simple
    };
    self._record(obj);

    if (self.consecutiveRestartMessages) {
      self.consecutiveRestartMessages = null;
      process.stdout.write("\n");
    }

    process.stdout.write(msg + "\n");
  },

  logRestart: function () {
    var self = this;

    if (self.consecutiveRestartMessages) {
      // replace old message in place
      process.stdout.write("\r");
      self.messages.pop();
      self.consecutiveRestartMessages ++;
    } else {
      self.consecutiveRestartMessages = 1;
    }

    var message = "=> Meteor server restarted";
    if (self.consecutiveRestartMessages > 1)
      message += " (x" + self.consecutiveRestartMessages + ")";
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

    if (self.consecutiveRestartMessages) {
      self.consecutiveRestartMessages = null;
      process.stdout.write("\n");
    }
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

exports.RunLog = RunLog;