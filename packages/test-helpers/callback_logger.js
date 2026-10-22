import isEqual from 'lodash.isequal';

// This file allows you to write tests that expect certain callbacks to be
// called in certain orders, or optionally in groups where the order does not
// matter.  It can be set up in either a synchronous manner, so that each
// callback must have already occurred before you call expectResult & its ilk, or
// in an asynchronous manner, so that the logger yields and waits a reasonable
// timeout for the callback.  Because we're using Node Fibers to yield & start
// ourselves, the asynchronous version is only available on the server.

var TIMEOUT = 1000;

// Run the given function, passing it a correctly-set-up callback logger as an
// argument.  If we're meant to be running asynchronously, the function gets its
// own Fiber.

withCallbackLogger = function (test, callbackNames, async, fun) {
  var logger = new CallbackLogger(test, callbackNames);
  return fun(logger);
};

var CallbackLogger = function (test, callbackNames) {
  var self = this;
  self._log = [];
  self._test = test;
  callbackNames.forEach(function (callbackName) {
    self[callbackName] = function (...args) {
      self._log.push({ callback: callbackName, args });
    };
  });
};

CallbackLogger.prototype.expectResult = async function (callbackName, args) {
  var self = this;
  await self._waitForLengthOrTimeout(1);
  if (self._log.length === 0) {
    self._test.fail(["Expected callback " + callbackName + " got none"]);
    return;
  }
  var result = self._log.shift();
  self._test.equal(result.callback, callbackName);
  self._test.equal(result.args, args);
};

CallbackLogger.prototype.expectResultOnly = async function (callbackName, args) {
  var self = this;
  await self.expectResult(callbackName, args);
  self._expectNoResultImpl();
};

// CallbackLogger.prototype._waitForLengthOrTimeout = async function (len) {
//   return new Promise(resolve => {
//     setTimeout(() => resolve(), len);
//   });
// };

CallbackLogger.prototype._waitForLengthOrTimeout = function (len) {
  var self = this;
  const timeoutControl = { executionTime:  0 };
  return new Promise(resolve => {
    const waitFunc = () => {
      if (timeoutControl.executionTime < TIMEOUT && self._log.length < len) {
        timeoutControl.executionTime += 100;
        setTimeout(waitFunc, 100);
      } else {
        resolve();
      }
    };
    waitFunc();
  });
};

CallbackLogger.prototype.expectResultUnordered = async function (list) {
  var self = this;

  await self._waitForLengthOrTimeout(list.length);

  list = [...list];

  var i = list.length;

  while (i > 0) {
    var found = false;
    var dequeued = self._log.shift();
    for (var j = 0; j < list.length; j++) {
      if (isEqual(list[j], dequeued)) {
        list.splice(j, 1);
        found = true;
        break;
      }
    }
    if (!found)
      self._test.fail(["Found unexpected result: " + JSON.stringify(dequeued)]);
    i--;
  }
};

CallbackLogger.prototype._expectNoResultImpl = function () {
  var self = this;
  self._test.length(self._log, 0);
};

CallbackLogger.prototype.expectNoResult = async function (fn) {
  var self = this;

  if (typeof fn === "function") {
    // If a function is provided, empty self._log and then call the
    // function, so that we don't accidentally carry over log items.
    self._log.length = 0;
    await fn();
  }

  await self._waitForLengthOrTimeout(0);

  self._expectNoResultImpl();
};
