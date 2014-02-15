Tinytest.add("logging - _getCallerDetails", function (test) {
  var details = Log._getCallerDetails();
  // Ignore this test for Opera, IE, Safari since this test would work only
  // in Chrome and Firefox, other browsers don't give us an ability to get
  // stacktrace.
  if ((new Error).stack) {
    test.equal(details.file, 'tinytest.js');

    // evaled statements shouldn't crash
    var code = "Log._getCallerDetails().file";
    test.matches(eval(code), /^eval|tinytest.js$/);
  }
});

Tinytest.add("logging - log", function (test) {
  var logBothMessageAndObject = function (log, level) {
    Log._intercept(3);

    // Tests for correctness
    log("message");
    log({property1: "foo", property2: "bar"});
    log({message: "mixed", property1: "foo", property2: "bar"});

    var intercepted = Log._intercepted();
    test.equal(intercepted.length, 3);

    var obj1 = EJSON.parse(intercepted[0]);
    test.equal(obj1.message, "message");
    test.equal(obj1.level, level);
    test.instanceOf(obj1.time, Date);

    var obj2 = EJSON.parse(intercepted[1]);
    test.isFalse(obj2.message);
    test.equal(obj2.property1, "foo");
    test.equal(obj2.property2, "bar");
    test.equal(obj2.level, level);
    test.instanceOf(obj2.time, Date);

    var obj3 = EJSON.parse(intercepted[2]);
    test.equal(obj3.message, "mixed");
    test.equal(obj3.property1, "foo");
    test.equal(obj3.property2, "bar");
    test.equal(obj3.level, level);
    test.instanceOf(obj3.time, Date);

    // Test logging falsy values, as well as single digits
    // and some other non-stringy things
    // In a format of testcase, expected result, name of the test.
    var testcases = [
          [1, "1", "single digit"],
          [0, "0", "falsy - 0"],
          [null, "null", "falsy - null"],
          [undefined, "undefined", "falsy - undefined"],
          [new Date("2013-06-13T01:15:16.000Z"), new Date("2013-06-13T01:15:16.000Z"), "date"],
          [/[^regexp]{0,1}/g, "/[^regexp]{0,1}/g", "regexp"],
          [true, "true", "boolean - true"],
          [false, "false", "boolean - false"],
          [-Infinity, "-Infinity", "number - -Infinity"]];

    Log._intercept(testcases.length);
    _.each(testcases, function (testcase) {
      log(testcase[0]);
    });

    intercepted = Log._intercepted();

    test.equal(intercepted.length, testcases.length);

    _.each(testcases, function (testcase, index) {
      var expected = testcase[1];
      var testName = testcase[2];
      var recieved = intercepted[index];
      var obj = EJSON.parse(recieved);

      // IE8 and old Safari don't support this date format. Skip it.
      if (expected && expected.toString &&
          (expected.toString() === "NaN" ||
           expected.toString() === "Invalid Date"))
        return;

      if (_.isDate(testcase[0]))
        obj.message = new Date(obj.message);
      test.equal(obj.message, expected, 'Logging ' + testName);
    });

    // Tests for correct exceptions
    Log._intercept(6);

    test.throws(function () {
      log({time: 'not the right time'});
    });
    test.throws(function () {
      log({level: 'not the right level'});
    });
    _.each(['file', 'line', 'program', 'originApp', 'satellite'],
      function (restrictedKey) {
      test.throws(function () {
        var obj = {};
        obj[restrictedKey] = 'usage of restricted key';
        log(obj);
      });
    });

    // Can't pass numbers, objects, arrays, regexps or functions as message
    var throwingTestcases = [1, NaN, {foo:"bar"}, ["a", "r", "r"], null,
                             undefined, new Date, function () { return 42; },
                             /[regexp]/ ];
    Log._intercept(throwingTestcases.length);
    _.each(throwingTestcases, function (testcase) {
      test.throws(function () {
        log({ message: testcase });
      });
    });

    // Since all tests above should throw, nothing should be printed.
    // This call will set the logging interception to the clean state as well.
    test.equal(Log._intercepted().length, 0);
  };

  logBothMessageAndObject(Log, 'info');
  _.each(['info', 'warn', 'error'], function (level) {
    logBothMessageAndObject(Log[level], level);
  });
});

Tinytest.add("logging - parse", function (test) {
  test.equal(Log.parse("message"), null);
  test.equal(Log.parse('{"foo": "bar"}'), null);
  var time = new Date;
  test.equal(Log.parse('{"foo": "bar", "time": ' + EJSON.stringify(time) + '}'),
                        { foo: "bar", time: time });
  test.equal(Log.parse('{"foo": not json "bar"}'), null);
  test.equal(Log.parse('{"time": "not a date object"}'), null);
});

Tinytest.add("logging - format", function (test) {
  var time = new Date(2012, 9 - 1/*0-based*/, 8, 7, 6, 5, 4);
  var utcOffsetStr = '(' + (-(new Date().getTimezoneOffset() / 60)) + ')';

  _.each(['debug', 'info', 'warn', 'error'], function (level) {
    test.equal(
      Log.format({message: "message", time: time, level: level}),
      level.charAt(0).toUpperCase() + "20120908-07:06:05.004" + utcOffsetStr + " message");

    test.equal(
      Log.format({message: "message", time: time, timeInexact: true, level: level}),
      level.charAt(0).toUpperCase() + "20120908-07:06:05.004" + utcOffsetStr + "? message");

    test.equal(
      Log.format({foo1: "bar1", foo2: "bar2", time: time, level: level}),
      level.charAt(0).toUpperCase() + '20120908-07:06:05.004' + utcOffsetStr + ' {"foo1":"bar1","foo2":"bar2"}');

    test.equal(
      Log.format({message: "message", foo: "bar", time: time, level: level}),
      level.charAt(0).toUpperCase() + '20120908-07:06:05.004' + utcOffsetStr + ' message {"foo":"bar"}');

    // Has everything except stderr field
    test.equal(
      Log.format({message: "message", foo: "bar", time: time, level: level, file: "app.js", line:42, app: "myApp", originApp: "proxy", program: "server"}),
      level.charAt(0).toUpperCase() + '20120908-07:06:05.004' + utcOffsetStr + ' [myApp via proxy] (server:app.js:42) message {\"foo\":\"bar\"}');

    // stderr
    test.equal(
      Log.format({message: "message from stderr", time: time, level: level, stderr: true}),
      level.charAt(0).toUpperCase() + '20120908-07:06:05.004' + utcOffsetStr + ' (STDERR) message from stderr');

    // app/originApp
    test.equal(
      Log.format({message: "message", time: time, level: level, app: "app", originApp: "app"}),
      level.charAt(0).toUpperCase() + '20120908-07:06:05.004' + utcOffsetStr + ' [app] message');
    test.equal(
      Log.format({message: "message", time: time, level: level, app: "app", originApp: "proxy"}),
      level.charAt(0).toUpperCase() + '20120908-07:06:05.004' + utcOffsetStr + ' [app via proxy] message');

    // source info
    test.equal(
      Log.format({message: "message", time: time, level: level, file: "app.js", line: 42, program: "server"}),
      level.charAt(0).toUpperCase() + '20120908-07:06:05.004' + utcOffsetStr + ' (server:app.js:42) message');
    test.equal(
      Log.format({message: "message", time: time, level: level, file: "app.js", line: 42}),
      level.charAt(0).toUpperCase() + '20120908-07:06:05.004' + utcOffsetStr + ' (app.js:42) message');
  });
});

