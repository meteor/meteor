Tinytest.add('ReactiveDict - set to undefined', function (test) {
  var dict = new ReactiveDict;
  dict.set('foo', undefined);
  test.equal(Object.keys(dict.all()), ['foo']);
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

Tinytest.add('ReactiveDict - has() reports presence, including undefined', function (test) {
  var dict = new ReactiveDict();
  test.isFalse(dict.has('foo'));

  [undefined, null, false, 0, ''].forEach(function (value) {
    dict.set('foo', value);
    test.isTrue(dict.has('foo'), 'has() should be true for ' + String(value));
    dict.delete('foo');
    test.isFalse(dict.has('foo'));
  });

  // initial data
  var withInitial = new ReactiveDict({a: 1, b: undefined});
  test.isTrue(withInitial.has('a'));
  test.isTrue(withInitial.has('b'));
  test.isFalse(withInitial.has('c'));

  // has() works outside of a computation
  test.isFalse(Tracker.active);
  test.isFalse(dict.has('missing'));
});

Tinytest.add('ReactiveDict - has() only reruns when presence changes', function (test) {
  var dict = new ReactiveDict();
  var seen = [];
  var computation = Tracker.autorun(function () {
    seen.push(dict.has('nickname'));
  });
  test.equal(seen, [false]);

  dict.set('nickname', undefined);
  Tracker.flush();
  test.equal(seen, [false, true]);

  // value-only changes and other keys don't rerun the observer
  dict.set('nickname', 'Ada');
  Tracker.flush();
  dict.set('nickname', 'Grace');
  Tracker.flush();
  dict.set('unrelated', 1);
  Tracker.flush();
  dict.setDefault('nickname', 'ignored');
  Tracker.flush();
  test.equal(seen, [false, true]);

  dict.delete('nickname');
  Tracker.flush();
  test.equal(seen, [false, true, false]);

  // deleting an absent key is not a presence change
  dict.delete('nickname');
  Tracker.flush();
  test.equal(seen, [false, true, false]);

  computation.stop();
});

Tinytest.add('ReactiveDict - has() with object forms, clear and destroy', function (test) {
  var dict = new ReactiveDict('test-has-destroy');
  var seenA = [];
  var seenB = [];
  var seenA2 = [];
  var a = Tracker.autorun(function () { seenA.push(dict.has('a')); });
  var a2 = Tracker.autorun(function () { seenA2.push(dict.has('a')); });
  var b = Tracker.autorun(function () { seenB.push(dict.has('b')); });

  dict.set({a: 1, b: 2});
  Tracker.flush();
  test.equal(seenA, [false, true]);
  test.equal(seenA2, [false, true]);
  test.equal(seenB, [false, true]);

  // setDefault on existing keys is a no-op
  dict.setDefault({a: 5, b: 6});
  Tracker.flush();
  test.equal(seenA, [false, true]);

  dict.clear();
  Tracker.flush();
  test.equal(seenA, [false, true, false]);
  test.equal(seenA2, [false, true, false]);
  test.equal(seenB, [false, true, false]);

  // clearing an already empty dict changes nothing
  dict.clear();
  Tracker.flush();
  test.equal(seenA, [false, true, false]);

  dict.setDefault({a: 1});
  Tracker.flush();
  test.equal(seenA, [false, true, false, true]);

  // a stopped computation is not rerun
  a2.stop();
  dict.destroy();
  Tracker.flush();
  test.equal(seenA, [false, true, false, true, false]);
  test.equal(seenA2, [false, true, false, true]);

  a.stop();
  b.stop();
  test.equal(Object.keys(dict.keyPresenceDeps).length, 0);
});

Tinytest.add('ReactiveDict - keys that shadow Object.prototype work', function (test) {
  var dict = new ReactiveDict();
  ['constructor', 'toString', 'hasOwnProperty'].forEach(function (key) {
    test.isFalse(dict.has(key));

    // no observers: must not throw
    dict.set(key, undefined);
    test.isTrue(dict.has(key));
    dict.set(key, 'value');
    test.equal(dict.get(key), 'value');
    test.isTrue(dict.equals(key, 'value'));

    test.isTrue(dict.delete(key));
    test.isFalse(dict.has(key));

    dict.set(key, 'again');
    dict.clear();
    test.isFalse(dict.has(key));
  });
});
