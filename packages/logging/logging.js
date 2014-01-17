Log = function () {
  return Log.info.apply(this, arguments);
};

/// FOR TESTING
var intercept = 0;
var interceptedLines = [];
var suppress = 0;

// Intercept the next 'count' calls to a Log function. The actual
// lines printed to the console can be cleared and read by calling
// Log._intercepted().
Log._intercept = function (count) {
  intercept += count;
};

// Suppress the next 'count' calls to a Log function. Use this to stop
// tests from spamming the console, especially with red errors that
// might look like a failing test.
Log._suppress = function (count) {
  suppress += count;
};

// Returns intercepted lines and resets the intercept counter.
Log._intercepted = function () {
  var lines = interceptedLines;
  interceptedLines = [];
  intercept = 0;
  return lines;
};

// Either 'json' or 'colored-text'.
//
// When this is set to 'json', print JSON documents that are parsed by another
// process ('satellite' or 'meteor run'). This other process should call
// 'Log.format' for nice output.
//
// When this is set to 'colored-text', call 'Log.format' before printing.
// This should be used for logging from within satellite, since there is no
// other process that will be reading its standard output.
Log.outputFormat = 'json';

var LEVEL_COLORS = {
  debug: 'green',
  // leave info as the default color
  warn: 'magenta',
  error: 'red'
};

var META_COLOR = 'blue';

// XXX package
var RESTRICTED_KEYS = ['time', 'timeInexact', 'level', 'file', 'line',
                        'program', 'originApp', 'satellite', 'stderr'];

var FORMATTED_KEYS = RESTRICTED_KEYS.concat(['app', 'message']);

var logInBrowser = function (obj) {
  var str = Log.format(obj);

  // XXX Some levels should be probably be sent to the server
  var level = obj.level;

  if ((typeof console !== 'undefined') && console[level]) {
    console[level](str);
  } else {
    // XXX Uses of Meteor._debug should probably be replaced by Log.debug or
    //     Log.info, and we should have another name for "do your best to
    //     call call console.log".
    Meteor._debug(str);
  }
};

// @returns {Object: { line: Number, file: String }}
Log._getCallerDetails = function () {
  var getStack = function () {
    // We do NOT use Error.prepareStackTrace here (a V8 extension that gets us a
    // pre-parsed stack) since it's impossible to compose it with the use of
    // Error.prepareStackTrace used on the server for source maps.
    var err = new Error;
    var stack = err.stack;
    return stack;
  };

  var stack = getStack();

  if (!stack) return {};

  var lines = stack.split('\n');

  // looking for the first line outside the logging package (or an
  // eval if we find that first)
  var line;
  for (var i = 1; i < lines.length; ++i) {
    line = lines[i];
    if (line.match(/^\s*at eval \(eval/)) {
      return {file: "eval"};
    }

    // XXX probably wants to be / or .js in case no source maps
    if (!line.match(/packages\/logging(?:\/|(?::tests)?\.js)/))
      break;
  }

  var details = {};

  // The format for FF is 'functionName@filePath:lineNumber'
  // The format for V8 is 'functionName (packages/logging/logging.js:81)' or
  //                      'packages/logging/logging.js:81'
  var match = /(?:[@(]| at )([^(]+?):([0-9:]+)(?:\)|$)/.exec(line);
  if (!match)
    return details;
  // in case the matched block here is line:column
  details.line = match[2].split(':')[0];

  // Possible format: https://foo.bar.com/scripts/file.js?random=foobar
  // XXX: if you can write the following in better way, please do it
  // XXX: what about evals?
  details.file = match[1].split('/').slice(-1)[0].split('?')[0];

  return details;
};

_.each(['debug', 'info', 'warn', 'error'], function (level) {
  // @param arg {String|Object}
  Log[level] = function (arg) {
    if (suppress) {
      suppress--;
      return;
    }

    var intercepted = false;
    if (intercept) {
      intercept--;
      intercepted = true;
    }

    var obj = (_.isObject(arg) && !_.isRegExp(arg) && !_.isDate(arg) ) ?
              arg : {message: new String(arg).toString() };

    _.each(RESTRICTED_KEYS, function (key) {
      if (obj[key])
        throw new Error("Can't set '" + key + "' in log message");
    });

    if (_.has(obj, 'message') && !_.isString(obj.message))
      throw new Error("The 'message' field in log objects must be a string");
    if (!obj.omitCallerDetails)
      obj = _.extend(Log._getCallerDetails(), obj);
    obj.time = new Date();
    obj.level = level;

    // XXX allow you to enable 'debug', probably per-package
    if (level === 'debug')
      return;

    if (intercepted) {
      interceptedLines.push(EJSON.stringify(obj));
    } else if (Meteor.isServer) {
      if (Log.outputFormat === 'colored-text') {
        console.log(Log.format(obj, {color: true}));
      } else if (Log.outputFormat === 'json') {
        console.log(EJSON.stringify(obj));
      } else {
        throw new Error("Unknown logging output format: " + Log.outputFormat);
      }
    } else {
      logInBrowser(obj);
    }
  };
});

// tries to parse line as EJSON. returns object if parse is successful, or null if not
Log.parse = function (line) {
  var obj = null;
  if (line && line.charAt(0) === '{') { // might be json generated from calling 'Log'
    try { obj = EJSON.parse(line); } catch (e) {}
  }

  // XXX should probably check fields other than 'time'
  if (obj && obj.time && (obj.time instanceof Date))
    return obj;
  else
    return null;
};

// formats a log object into colored human and machine-readable text
Log.format = function (obj, options) {
  obj = EJSON.clone(obj); // don't mutate the argument
  options = options || {};

  var time = obj.time;
  if (!(time instanceof Date))
    throw new Error("'time' must be a Date object");
  var timeInexact = obj.timeInexact;

  // store fields that are in FORMATTED_KEYS since we strip them
  var level = obj.level || 'info';
  var file = obj.file;
  var lineNumber = obj.line;
  var appName = obj.app || '';
  var originApp = obj.originApp;
  var message = obj.message || '';
  var program = obj.program || '';
  var satellite = obj.satellite;
  var stderr = obj.stderr || '';

  _.each(FORMATTED_KEYS, function(key) {
    delete obj[key];
  });

  if (!_.isEmpty(obj)) {
    if (message) message += " ";
    message += EJSON.stringify(obj);
  }

  var pad2 = function(n) { return n < 10 ? '0' + n : n.toString(); };
  var pad3 = function(n) { return n < 100 ? '0' + pad2(n) : n.toString(); };

  var dateStamp = time.getFullYear().toString() +
    pad2(time.getMonth() + 1 /*0-based*/) +
    pad2(time.getDate());
  var timeStamp = pad2(time.getHours()) +
        ':' +
        pad2(time.getMinutes()) +
        ':' +
        pad2(time.getSeconds()) +
        '.' +
        pad3(time.getMilliseconds());

  // eg in San Francisco in June this will be '(-7)'
  var utcOffsetStr = '(' + (-(new Date().getTimezoneOffset() / 60)) + ')';

  var appInfo = '';
  if (appName) appInfo += appName;
  if (originApp && originApp !== appName) appInfo += ' via ' + originApp;
  if (appInfo) appInfo = '[' + appInfo + '] ';

  var sourceInfo = (file && lineNumber) ?
      ['(', (program ? program + ':' : ''), file, ':', lineNumber, ') '].join('')
      : '';

  if (satellite)
    sourceInfo += ['[', satellite, ']'].join('');

  var stderrIndicator = stderr ? '(STDERR) ' : '';

  var metaPrefix = [
    level.charAt(0).toUpperCase(),
    dateStamp,
    '-',
    timeStamp,
    utcOffsetStr,
    timeInexact ? '? ' : ' ',
    appInfo,
    sourceInfo,
    stderrIndicator].join('');

  var prettify = function (line, color) {
    return (options.color && Meteor.isServer && color) ?
      Npm.require('cli-color')[color](line) : line;
  };

  return prettify(metaPrefix, META_COLOR)
    + prettify(message, LEVEL_COLORS[level]);
};

// Turn a line of text into a loggable object.
// @param line {String}
// @param override {Object}
Log.objFromText = function (line, override) {
  var obj = {message: line, level: "info", time: new Date(), timeInexact: true};
  return _.extend(obj, override);
};
