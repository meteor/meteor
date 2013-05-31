// @export Log
Log = function () {
  return Log.info.apply(this, arguments);
};

/// FOR TESTING
var intercept = 0;
var interceptedLines = [];

// Intercept the next 'count' calls to a Log function. The actual
// lines printed to the console can be cleared and read by calling
// Log._intercepted().
Log._intercept = function (count) {
  intercept += count;
};
Log._intercepted = function () {
  var lines = interceptedLines;
  interceptedLines = [];
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
  info: 'blue',
  warn: 'yellow',
  error: 'red'
};

var META_COLOR = 'magenta';

// XXX package
var RESTRICTED_KEYS = ['time', 'timeInexact', 'level', 'file', 'line',
                        'program', 'originApp', 'stderr'];

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
    var orig = Error.prepareStackTrace;
    Error.prepareStackTrace = function(_, stack){ return stack; };
    var err = new Error;
    var stack = err.stack;
    Error.prepareStackTrace = orig;
    return stack;
  };

  var stack = getStack();

  if (!stack) return {};

  var isV8 = false;
  var lines = stack;
  // check for V8 specifics
  if (_.isArray(stack))
    isV8 = true;
  else
    lines = stack.split('\n');
  var index = 1;
  var line = lines[index];

  // looking for the first line outside the logging package
  while ((isV8 ? line.getFileName() || '' : line)
          .indexOf('/packages/logging.js') !== -1)
    line = lines[++index];

  var details = {};

  // The format for FF is functionName@filePath:lineNumber
  // For V8 call built-in function
  details.line = isV8 ? line.getLineNumber() : line.split(':').slice(-1)[0];

  // Possible format: https://foo.bar.com/scripts/file.js?random=foobar
  // For FF we parse the line, for V8 we call built-in function
  // XXX: if you can write the following in better way, please do it
  details.file = isV8 ? line.getFileName() || (line.isEval() ? 'eval' : '')
                      : line.split('@')[1].split(':').slice(0, -1).join(':');
  details.file = details.file.split('/').slice(-1)[0].split('?')[0];

  return details;
};

_.each(['debug', 'info', 'warn', 'error'], function (level) {
  // @param arg {String|Object}
  Log[level] = function (arg) {
    var intercepted;
    if (intercept) {
      intercept--;
      intercepted = true;
    }

    var obj = (typeof arg === 'string') ? {message: arg}: arg;

    _.each(RESTRICTED_KEYS, function (key) {
      if (obj[key])
        throw new Error("Can't set '" + key + "' in log message");
    });

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
  var stderr = obj.stderr || '';

  _.each(FORMATTED_KEYS, function(key) {
    delete obj[key];
  });

  if (!_.isEmpty(obj)) {
    if (message) message += " ";
    message += EJSON.stringify(obj);
  }

  var pad2 = function(n) { return n < 10 ? '0' + n : n; };
  var pad3 = function(n) { return n < 100 ? '0' + pad2(n) : n; };

  var dateStamp = time.getFullYear() +
    pad2(time.getMonth() + 1 /*0-based*/) +
    pad2(time.getDate());
  var timeStamp = pad2(time.getHours()) +
        ':' +
        pad2(time.getMinutes()) +
        ':' +
        pad2(time.getSeconds()) +
        '.' +
        pad3(time.getMilliseconds());

  var appInfo = '';
  if (appName) appInfo += appName;
  if (originApp && originApp !== appName) appInfo += ' via ' + originApp;
  if (appInfo) appInfo = '[' + appInfo + '] ';

  var sourceInfo = (file && lineNumber) ?
      ['(', (program ? program + ':' : ''), file, ':', lineNumber, ') '].join('')
      : '';

  var stderrIndicator = stderr ? '(STDERR) ' : '';

  var metaPrefix = [
    level.charAt(0).toUpperCase(),
    dateStamp,
    '-',
    timeStamp,
    timeInexact ? '?' : ' ',
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
