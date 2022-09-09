// Simple implementation of dynamic scoping, for use in browsers

var nextSlot = 0;
var currentValues = [];

const isAsyncFunction = func => {
  const {constructor: { name } = {}} = func || {};
  return name === 'AsyncFunction';
};

Meteor.EnvironmentVariable = function () {
  this.slot = nextSlot++;
};

var EVp = Meteor.EnvironmentVariable.prototype;

EVp.get = function () {
  const currentContext = Zone.current;
  if (!currentContext?.get) {
    return null;
  }
  return currentContext.get('invocationContext')?.context;
};

EVp.getOrNullIfOutsideFiber = function () {
  return null;
};

EVp.withValue = function (value, func) {
  const currentContext = Zone.current;
  const currentInvocationContext = currentContext.get('invocationContext') || {};
  const invocationContext = { ...currentInvocationContext, context: value };
  const newContext = currentContext.fork({
    properties: { invocationContext }
  });
  return newContext.run(async () => {
    return await func();
  });
};

Meteor.bindEnvironment = function (func, onException, _this) {
  // needed in order to be able to create closures inside func and
  // have the closed variables not change back to their original
  // values
  var boundValues = currentValues.slice();

  if (!onException || typeof(onException) === 'string') {
    var description = onException || "callback of async function";
    onException = function (error) {
      Meteor._debug(
        "Exception in " + description + ":",
        error
      );
    };
  }

  return function (/* arguments */) {
    var savedValues = currentValues;
    try {
      currentValues = boundValues;
      var ret = func.apply(_this, arguments);
    } catch (e) {
      // note: callback-hook currently relies on the fact that if onException
      // throws in the browser, the wrapped call throws.
      onException(e);
    } finally {
      currentValues = savedValues;
    }
    return ret;
  };
};

Meteor._nodeCodeMustBeInFiber = function () {
  // no-op on browser
};
