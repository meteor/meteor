Tinytest.add("logging - log", function (test) {
  var logBothMessageAndObject = function (log, level) {
    Log._intercept(3);

    log("message");
    log({property1: "foo", property2: "bar"});
    log({message: "mixed", property1: "foo", property2: "bar"});

    test.throws(function () {
      log({time: 'not the right time'});
    });
    test.throws(function () {
      log({level: 'not the right level'});
    });

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
};

  logBothMessageAndObject(Log, 'info');
  _.each(['debug', 'info', 'warn', 'error'], function (level) {
    logBothMessageAndObject(Log[level], level);
  });
});

Tinytest.add("logging - parse", function (test) {
  test.equal(Log.parse("message"), null);
  test.equal(Log.parse('{"foo": "bar"}'), {foo: "bar"});
  test.equal(Log.parse('{"foo": not json "bar"}'), null);
});

Tinytest.add("logging - format", function (test) {
  var time = new Date(2012, 9 - 1/*0-based*/, 8, 7, 6, 5, 4);
  _.each(['debug', 'info', 'warn', 'error'], function (level) {
    test.equal(
      Log.format({message: "message", time: time, level: level}),
      level.charAt(0).toUpperCase() + "20120908-07:06:05.004 message");

    test.equal(
      Log.format({message: "message", time: time, timeInexact: true, level: level}),
      level.charAt(0).toUpperCase() + "20120908-07:06:05.004?message");

    test.equal(
      Log.format({foo1: "bar1", foo2: "bar2", time: time, level: level}),
      level.charAt(0).toUpperCase() + '20120908-07:06:05.004 {"foo1":"bar1","foo2":"bar2"}');

    test.equal(
      Log.format({message: "message", foo: "bar", time: time, level: level}),
      level.charAt(0).toUpperCase() + '20120908-07:06:05.004 message {"foo":"bar"}');

  });
});
