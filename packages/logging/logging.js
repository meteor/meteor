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

// XXX file, line, package
var RESTRICTED_KEYS = ['time', 'timeInexact', 'level'];

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

_.each(['debug', 'info', 'warn', 'error'], function (level) {
  // @param arg {String|Object}
  Log[level] = function (arg) {
    var intercepted;
    if (intercept) {
      intercept--;
      intercepted = true;
    }

    var obj = (typeof arg === 'string') ? {message: arg} : arg;

    _.each(RESTRICTED_KEYS, function (key) {
      if (obj[key])
        throw new Error("Can't set '" + key + "' in log message");
    });

		obj.time = new Date();
    obj.level = level;
    // XXX file, line, package

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
  if (line && line[0] === '{') { // might be json generated from calling 'Log'
    try { obj = EJSON.parse(line); } catch (e) {}
  }
  return obj;
};

// formats a log object into colored human and machine-readable text
Log.format = function (obj, options) {
  obj = EJSON.clone(obj); // don't mutate the argument
  options = options || {};

  var time = obj.time;
  if (!(time instanceof Date))
    throw new Error("'time' must be a Date object");
  var timeInexact = obj.timeInexact;

  var level = obj.level || 'info';

  _.each(RESTRICTED_KEYS, function(key) {
    delete obj[key];
  });

  var message = obj.message || '';
  delete obj.message;
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

  var line = [
    level.charAt(0).toUpperCase(),
    dateStamp,
    '-',
    timeStamp,
    timeInexact ? '?' : ' ',
    message].join('');

  if (options.color && Meteor.isServer) {
    var color = LEVEL_COLORS[level];
    if (color)
      line = Npm.require('cli-color')[color](line);
  }

  return line;
};

Log.logFromText = function (line) {
  // Turn a line of text into a loggable object.
  return {message: line, level: "info", time: new Date(), timeInexact: true};
};

Log.printColorfullyFromTextOrJSON = function (line) {
  var obj = Log.parse(line);

  var logIt = function (obj) {
    console.log(Log.format(obj, { color: true }));
  };

  try {
    logIt(obj || Log.logFromText(line));
  } catch (e) {
    logIt(Log.logFromText(line));
  }
};
