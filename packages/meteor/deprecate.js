if (Meteor.isServer && Meteor.isDevelopment) {
  if (typeof __meteor_runtime_config__ === 'object') {
    var noDeprecation = process.env.METEOR_NO_DEPRECATION || process.noDeprecation;
    if (noDeprecation === 'true' || noDeprecation === 'false') {
      noDeprecation = noDeprecation === 'true';
    }
    __meteor_runtime_config__.noDeprecation = noDeprecation;
  }
}

function oncePerArgument(func) {
  var cache = new Map();

  return function _oncePerArgument() {
    var key = JSON.stringify(arguments);
    if (!cache.has(key)) {
      var result = func.apply(this, arguments);
      cache.set(key, result);
    }
    return cache.get(key);
  };
}

function cleanStackTrace(stackTrace) {
  if (!stackTrace || typeof stackTrace !== 'string') return [];
  var lines = stackTrace.split('\n');
  var trace = [];
  try {
    for (var i = 0; i < lines.length; i++) {
      var _line = lines[i].trim();
      if (_line.indexOf('Meteor.deprecate') !== -1) continue;
      if (_line.indexOf('packages/') !== -1) {
        trace.push(_line);
      } else if (_line && _line.indexOf('/') !== -1) {
        // Stop processing if a valid path that does not start with 'packages/**' is found
        trace.push(_line);
        break;
      }
    }
  } catch (e) {
    console.error('Error cleaning stack trace: ', e);
  }
  return trace.join('\n');
}

var onceWarning = oncePerArgument(function _onceWarning(message) {
  console.warn.apply(console, message);
});

function onceFixDeprecation() {
  onceWarning(['Deprecation warnings are hidden but crucial to address for future Meteor updates.', '\n', 'Remove the `METEOR_NO_DEPRECATION` env var to reveal them, then report or fix the issues.']);
}

Meteor.deprecate = function () {
  if (!Meteor.isDevelopment) {
    return;
  }
  if (typeof console !== 'undefined' && typeof console.warn !== 'undefined') {
    var stackStrace = cleanStackTrace(new Error().stack || '');
    var messages = Array.prototype.slice.call(arguments); // Convert arguments to array

    if (typeof __meteor_runtime_config__.noDeprecation === 'string') {
      var noDeprecationPattern = new RegExp(__meteor_runtime_config__.noDeprecation);
      if (noDeprecationPattern.test(stackStrace)) {
        onceFixDeprecation();
        return;
      }
    } else if (typeof __meteor_runtime_config__.noDeprecation === 'boolean' && __meteor_runtime_config__.noDeprecation) {
      onceFixDeprecation();
      return;
    }
    if (stackStrace.length > 0) {
      messages.push('\n\n', 'Trace:', '\n', stackStrace);
    }
    messages.push('\n\n', 'To disable warnings, set the `METEOR_NO_DEPRECATION` to `true` or a regex pattern.', '\n');

    onceWarning(['[DEPRECATION]'].concat(messages));
  }
};
