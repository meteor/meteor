Tinytest.add('ReactiveDict - all() works', function (test) {
  _.each([SerializingReactiveDict, ReactiveDict], function (type) {
    var all = {}, dict = new type();
    Tracker.autorun(function() {
      all = dict.all();
    });
    
    test.equal(all, {});
    
    dict.set('foo', 'bar');

    Tracker.flush();

    test.equal(all, {foo: 'bar'});
  });
});

Tinytest.add('ReactiveDict - clear() works', function (test) {
  _.each([SerializingReactiveDict, ReactiveDict], function (type) {
    var dict = new type();

    dict.set('foo', 'bar');
    
    var val, equals, equalsUndefined, all;
    Tracker.autorun(function() {
      val = dict.get('foo');
    });

    Tracker.autorun(function() {
      all = dict.all();
    });

    if (type === SerializingReactiveDict) {
      Tracker.autorun(function() {
        equals = dict.equals('foo', 'bar');
      });

      Tracker.autorun(function() {
        equalsUndefined = dict.equals('foo', undefined);
      });
    }
    
    test.equal(val, 'bar');
    test.equal(all, {foo: 'bar'});

    if (type === SerializingReactiveDict) {
      test.equal(equals, true);
      test.equal(equalsUndefined, false);
    }
    
    dict.clear();
    Tracker.flush();

    test.isUndefined(val);
    test.equal(all, {});
    
    if (type === SerializingReactiveDict) {
      test.equal(equals, false);
      test.equal(equalsUndefined, true);
    }
  });
});


Tinytest.add('ReactiveDict - setDefault', function (test) {
  _.each([SerializingReactiveDict, ReactiveDict], function (type) {
    var reactiveDict = new type();

    reactiveDict.setDefault('def', "argyle");
    test.equal(reactiveDict.get('def'), "argyle");
    reactiveDict.set('def', "noodle");
    test.equal(reactiveDict.get('def'), "noodle");
    reactiveDict.set('nondef', "potato");
    test.equal(reactiveDict.get('nondef'), "potato");
    reactiveDict.setDefault('nondef', "eggs");
    test.equal(reactiveDict.get('nondef'), "potato");
  });
});

Tinytest.add('ReactiveDict - get/set types', function (test) {
  // Test that initial value is undefined
  var reactiveDict = new ReactiveDict();
  test.equal(reactiveDict.get('u'), undefined);

  var serializingReactiveDict = new ReactiveDict();
  test.equal(serializingReactiveDict.get('u'), undefined);

  // Test that a bunch of types can be get and set properly
  var testGetAndSet = function (value) {
    var baseRD = new ReactiveDict();
    var serializingRD = new SerializingReactiveDict();

    baseRD.set("key", value);
    test.equal(baseRD.get("key"), value);

    serializingRD.set("key", value);
    test.equal(serializingRD.get("key"), value);
  };

  _.each([
    undefined,
    null,
    true,
    false,
    0,
    "true",
    [1, 2, {a: 1, b: [5, 6]}],
    {a: 1, b: [5, 6]},
    new Date(1234),
    new Mongo.ObjectID('ffffffffffffffffffffffff')
  ], testGetAndSet);
});

Tinytest.add('ReactiveDict - context invalidation for get', function (test) {
  _.each([SerializingReactiveDict, ReactiveDict], function (type) {
    var reactiveDict = new type();

    var xGetExecutions = 0;
    Tracker.autorun(function () {
      ++xGetExecutions;
      reactiveDict.get('x');
    });
    test.equal(xGetExecutions, 1);
    reactiveDict.set('x', 1);
    // Invalidation shouldn't happen until flush time.
    test.equal(xGetExecutions, 1);
    Tracker.flush();
    test.equal(xGetExecutions, 2);
    // Setting to the same value doesn't re-run.
    reactiveDict.set('x', 1);
    Tracker.flush();
    test.equal(xGetExecutions, 2);
    reactiveDict.set('x', '1');
    Tracker.flush();
    test.equal(xGetExecutions, 3);
  });
});
