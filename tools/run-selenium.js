var _ = require('underscore');
var Fiber = require('fibers');
var Future = require('fibers/future');
var files = require('./files.js');
var runLog = require('./run-log.js');
var utils = require('./utils.js');

// options: runner url browserId xunitOutputFile
var Selenium = function (options) {
  var self = this;
  options = options || {};

  self.driver = null;
  self.server = null;

  self.browserId = options.browserId || 'xunit';
  self.url = options.url || 'http://localhost:3000/' + self.browserId;
  self.xunitOutputFile = options.xunitOutputFile || 'test-results.xml';

  self.runner = options.runner;
  self.browser = options.browser || 'chrome';

  self.xunitLines = null;
};

var _promiseToFuture = function (promise) {
  var fut = new Future;
  promise.then(function (result) {
    fut.isResolved() || fut['return'](result);
  }, function (err) {
    fut.isResolved() || fut['throw'](err);
  });
  return fut;
};


// The magic prefix for special log output
// Must match packages/test-in-console/driver.js
var MAGIC_PREFIX = '##_meteor_magic##';

// For some reason, we can't see the console.log output
// unless we 'flush' it by sending another console.log via execute()
// Note that this is actually a magic message, so we get it echoed back to us;
// that's not necessary for this to work, but it keeps the output clean for users.
var DUMMY_FLUSH = MAGIC_PREFIX + "flush: flush";

_.extend(Selenium.prototype, {
  // Start the selenium server, block (yield) until it is ready to go
  // (actively listening on outer and proxying to inner), and then
  // return.
  start: function () {
    var self = this;

    if (self.server)
      throw new Error("already running?");

    self.xunitLines = [];

    var webdriver = require('selenium-webdriver');

    var capabilities;
    var loggingPrefs;
    if (self.browser === 'chrome') {
      capabilities = webdriver.Capabilities.chrome();
      loggingPrefs = {'browser': 'ALL'};
    } else if (self.browser === 'firefox') {
      capabilities = webdriver.Capabilities.firefox();
      loggingPrefs = {'browser': 'ALL'};
    } else {
      throw new Error("Unhandled browser: " + self.browser);
    }

    if (loggingPrefs) {
      capabilities = capabilities.set('loggingPrefs', loggingPrefs);
    }

    var builder = new webdriver.Builder().withCapabilities(capabilities);
    self.driver = builder.build();

    var fut = _promiseToFuture(self.driver.getSession());
    fut.wait();

    _promiseToFuture(self.driver.get(self.url)).wait();

    Fiber(function () {
      try {
        self._pollLogs();
      } catch (err) {
        runLog.log("Log polling exited unexpectedly: " + err);
      }
    }).run();
  },

  stop: function () {
    var self = this;

    if (! self.driver)
      return;

    _promiseToFuture(self.driver.close()).wait();
    _promiseToFuture(self.driver.quit()).wait();
    self.driver = null;
  },

  _flushLogs: function () {
    var self = this;

    var promise = self.driver.executeScript("console.log('" + DUMMY_FLUSH + "');", []);
    _promiseToFuture(promise).wait();
  },

  _getLogs: function () {
    var self = this;

    var promise = self.driver.manage().logs().get('browser');
    return _promiseToFuture(promise).wait();
  },

  _gotStateDone: function () {
    var self = this;

    if (self.xunitOutputFile) {
      runLog.log("Writing xunit output to: " + self.xunitOutputFile);
      files.writeFile(self.xunitOutputFile, self.xunitLines.join('\n'));
    }

    if (self.runner) {
      runLog.log("Shutting down in response to 'done' state");
      self.runner.stop();
      process.exit(0);
    }
  },

  _gotState: function (state) {
    var self = this;

    runLog.log("State -> " + state);

    if (state === "done") {
      self._gotStateDone();
    }
  },

  _gotMagicLog: function (facility, msg) {
    var self = this;

    if (facility === 'xunit') {
      self.xunitLines.push(msg);
    } else if (facility === 'state') {
      self._gotState(msg);
    } else if (facility === 'flush') {
      // Ignore
    } else {
      runLog.log("Unknown magic: " + facility + ": " + msg);
    }
  },

  _pollLogsOnce: function () {
    var self = this;

    self._flushLogs();
    var logs = self._getLogs();
    _.each(logs, function (log) {
      var msg = log.message;
      var regex = /([^\s]*)\s*([^\s]*)\s*(.*)/i;
      var match = regex.exec(msg);
      if (!match) {
        runLog.log("Unknown console.log message format: " + JSON.stringify(log));
        return;
      }
      msg = match[3];
      if (msg === DUMMY_FLUSH) return;
      if (msg.indexOf(MAGIC_PREFIX) === 0) {
        msg = msg.substring(MAGIC_PREFIX.length);
        var colonIndex = msg.indexOf(': ');
        if (colonIndex === -1) {
          self._gotMagicLog('', msg);
        } else {
          var facility = msg.substring(0, colonIndex);
          msg = msg.substring(colonIndex + 2);
          self._gotMagicLog(facility, msg);
        }
      } else {
        runLog.log(msg);
      }
    });
  },

  _pollLogs: function () {
    var self = this;

    while (self.driver) {
      try {
        self._pollLogsOnce();
      } catch (err) {
        runLog.log("Error reading console log: " + err);
      }
      utils.sleepMs(1000);
    }
  },
});

exports.Selenium = Selenium;
