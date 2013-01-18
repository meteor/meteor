CallbackLogger = function (test, callbackNames) {
  var self = this;
  self._log = [];
  self._test = test;
  _.each(callbackNames, function (callbackName) {
    self[callbackName] = function () {
      var args = _.toArray(arguments);
      self._log.push({callback: callbackName, args: args});
    };
  });
};

CallbackLogger.prototype.expectResult = function (callbackName, args) {
  var self = this;
  if (_.isEmpty(self._log))
    self._test.fail("Expected callback " + callbackName + " got none");
  var result = self._log.shift();
  self._test.equal(result.callback, callbackName);
  self._test.equal(result.args, args);
};

CallbackLogger.prototype.expectResultUnordered = function (list) {
  var self = this;
  list = _.clone(list); // shallow copy.
  var i = list.length;
  while (i > 0) {
    var found = false;
    var dequeued = self._log.shift();
    for (var j = 0; j < list.length; j++) {
      if (_.isEqual(list[j], dequeued)) {
        list.splice(j, 1);
        found = true;
        break;
      }
    }
    if (!found)
      self._test.fail("Found unexpected result: " + JSON.stringify(dequeued));
    i--;
  }
};

CallbackLogger.prototype.expectNoResult = function () {
  var self = this;
  self._test.length(self._log, 0);
};
