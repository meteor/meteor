Tinytest.add('ReactiveDict - set to undefined', function (test) {
  var dict = new ReactiveDict;
  dict.set('foo', undefined);
  test.equal(_.keys(dict.all()), ['foo']);
  dict.setDefault('foo', 'bar');
  test.equal(dict.get('foo'), undefined);
});

Tinytest.add('ReactiveDict - initialize with data', function (test) {
  var now = new Date();
  var dict = new ReactiveDict({
    now: now
  });

  var nowFromDict = dict.get('now');
  test.equal(nowFromDict, now);

  // Test with static value here as a named dict could
  // be migrated if code reload happens while testing
  dict = new ReactiveDict('foo', {
    foo: 'bar'
  });

  nowFromDict = dict.get('foo');
  test.equal(nowFromDict, 'bar');

  dict = new ReactiveDict(undefined, {
    now: now
  });

  nowFromDict = dict.get('now');
  test.equal(nowFromDict, now);
});

Tinytest.add('ReactiveDict - setDefault', function (test) {
  var dict = new ReactiveDict;
  dict.set('A', 'blah');
  dict.set('B', undefined);
  dict.setDefault('A', 'default');
  dict.setDefault('B', 'default');
  dict.setDefault('C', 'default');
  dict.setDefault('D', undefined);
  test.equal(dict.all(), {A: 'blah', B: undefined,
                          C: 'default', D: undefined});

  dict = new ReactiveDict;
  dict.set('A', 'blah');
  dict.set('B', undefined);
  dict.setDefault({
    A: 'default',
    B: 'defualt',
    C: 'default',
    D: undefined
  });
  test.equal(dict.all(), {A: 'blah', B: undefined,
                          C: 'default', D: undefined});
});

Tinytest.add('ReactiveDict - all() works', function (test) {
  var all = {}, dict = new ReactiveDict;
  Tracker.autorun(function() {
    all = dict.all();
  });

  test.equal(all, {});

  dict.set('foo', 'bar');
  Tracker.flush();
  test.equal(all, {foo: 'bar'});

  dict.set('blah', undefined);
  Tracker.flush();
  test.equal(all, {foo: 'bar', blah: undefined});
});


Tinytest.add('ReactiveDict - clear() works', function (test) {
  var dict = new ReactiveDict;
  dict.set('foo', 'bar');

  // Clear should not throw an error now
  // See issue #5530
  dict.clear();

  dict.set('foo', 'bar');

  var val, equals, equalsUndefined, all;
  Tracker.autorun(function() {
    val = dict.get('foo');
  });
  Tracker.autorun(function() {
    equals = dict.equals('foo', 'bar');
  });
  Tracker.autorun(function() {
    equalsUndefined = dict.equals('foo', undefined);
  });
  Tracker.autorun(function() {
    all = dict.all();
  });

  test.equal(val, 'bar');
  test.equal(equals, true);
  test.equal(equalsUndefined, false);
  test.equal(all, {foo: 'bar'});

  dict.clear();
  Tracker.flush();
  test.isUndefined(val);
  test.equal(equals, false);
  test.equal(equalsUndefined, true);
  test.equal(all, {});
});

Tinytest.add('ReactiveDict - delete(key) works', function (test) {
  var dict = new ReactiveDict;
  dict.set('foo', 'bar');
  dict.set('bar', 'foo');

  dict.set('baz', 123);
  test.equal(dict.delete('baz'), true);
  test.equal(dict.delete('baz'), false);

  var val, equals, equalsUndefined, all;

  Tracker.autorun(function() {
    val = dict.get('foo');
  });
  Tracker.autorun(function() {
    equals = dict.equals('foo', 'bar');
  });
  Tracker.autorun(function() {
    equalsUndefined = dict.equals('foo', undefined);
  });
  Tracker.autorun(function() {
    all = dict.all();
  });

  test.equal(val, 'bar');
  test.equal(equals, true);
  test.equal(equalsUndefined, false);
  test.equal(all, {foo: 'bar', bar: 'foo'});

  var didRemove = dict.delete('foo');
  test.equal(didRemove, true);

  Tracker.flush();

  test.isUndefined(val);
  test.equal(equals, false);
  test.equal(equalsUndefined, true);
  test.equal(all, {bar: 'foo'});

  didRemove = dict.delete('barfoobar');
  test.equal(didRemove, false);
});

Tinytest.add('ReactiveDict - destroy works', function (test) {
  var dict = new ReactiveDict('test');

  // Should throw on client when reload package is present
  Meteor.isClient && test.throws(function () {
    var dict2 = new ReactiveDict('test');
  }, 'Duplicate ReactiveDict name: test');

  dict.set('foo', 'bar');

  var val, equals, equalsUndefined, all;
  Tracker.autorun(function() {
    val = dict.get('foo');
  });
  Tracker.autorun(function() {
    equals = dict.equals('foo', 'bar');
  });
  Tracker.autorun(function() {
    equalsUndefined = dict.equals('foo', undefined);
  });
  Tracker.autorun(function() {
    all = dict.all();
  });

  test.equal(val, 'bar');
  test.equal(equals, true);
  test.equal(equalsUndefined, false);
  test.equal(all, {foo: 'bar'});

  // .destroy() should clear the dict
  dict.destroy();
  Tracker.flush();
  test.isUndefined(val);
  test.equal(equals, false);
  test.equal(equalsUndefined, true);
  test.equal(all, {});
  
  // Shouldn't throw now that we've destroyed the previous dict
  dict = new ReactiveDict('test');
});
