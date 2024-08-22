Tinytest.add("environment - helpers", function (test) {
  /*** ensure ***/
  var x = {};
  var y = Meteor._ensure(x, "a", "b", "c");
  test.equal(x, {a: {b: {c: {}}}});
  test.equal(y, {});
  y.d = 12;
  test.equal(x, {a: {b: {c: {d: 12}}}});
  test.equal(y, {d: 12});

  y = Meteor._ensure(x, "a", "b", "c");
  test.equal(x, {a: {b: {c: {d: 12}}}});
  test.equal(y, {d: 12});
  y.x = 13;
  test.equal(x, {a: {b: {c: {d: 12, x: 13}}}});
  test.equal(y, {d: 12, x: 13});

  y = Meteor._ensure(x, "a", "n");
  test.equal(x, {a: {b: {c: {d: 12, x: 13}}, n: {}}});
  test.equal(y, {});
  y.d = 22;
  test.equal(x, {a: {b: {c: {d: 12, x: 13}}, n: {d: 22}}});
  test.equal(y, {d: 22});

  Meteor._ensure(x, "a", "q", "r")["s"] = 99
  test.equal(x, {a: {b: {c: {d: 12, x: 13}}, n: {d: 22}, q: {r: {s: 99}}}});

  Meteor._ensure(x, "b")["z"] = 44;
  test.equal(x, {a: {b: {c: {d: 12, x: 13}}, n: {d: 22}, q: {r: {s: 99}}},
                 b: {z: 44}});

  /*** delete ***/

  x = {};
  Meteor._delete(x, "a", "b", "c");
  test.equal(x, {});

  x = {a: {b: {}}};
  Meteor._delete(x, "a", "b", "c");
  test.equal(x, {});

  x = {a: {b: {}, n: {}}};
  Meteor._delete(x, "a", "b", "c");
  test.equal(x, {a: {n: {}}});

  x = {a: {b: {}}, n: {}};
  Meteor._delete(x, "a", "b", "c");
  test.equal(x, {n: {}});

  x = {a: {b: 99}};
  Meteor._delete(x, "a", "b", "c");
  test.equal(x, {});

  x = {a: {b: 99}};
  Meteor._delete(x, "a", "b", "c", "d");
  test.equal(x, {});

  x = {a: {b: 99}};
  Meteor._delete(x, "a", "b", "c", "d", "e", "f");
  test.equal(x, {});

  x = {a: {b: {c: {d: 99}}}, x: 12};
  Meteor._delete(x, "a", "b", "c", "d");
  test.equal(x, {x: 12});

  x = {a: {b: {c: {d: 99}}, x: 12}};
  Meteor._delete(x, "a", "b", "c", "d");
  test.equal(x, {a: {x: 12}});

  x = {a: 12, b: 13};
  Meteor._delete(x, "a");
  test.equal(x, {b: 13});

  x = {a: 12};
  Meteor._delete(x, "a");
  test.equal(x, {});

  /*** inherits ***/
  var Parent = function () {};
  Parent.parentStaticProp = true;
  Parent.prototype.parentProp = true;

  var Child = function () {};
  Meteor._inherits(Child, Parent);

  Child.prototype.childProp = true;

  test.isTrue(Child.parentStaticProp, 'copy parent static props');
  test.equal(Child.__super__, Parent.prototype, '__super__ is set');

  var c = new Child;
  test.isTrue(c.parentProp, 'prototype chain hooked up correctly');
});

Tinytest.add("environment - startup", function (test) {
  // After startup, Meteor.startup should call the callback immediately.
  var called = false;
  Meteor.startup(function () {
    called = true;
  });
  test.isTrue(called);
});

Tinytest.addAsync("environment - promisify", function (test, done) {
  function TestClass(value) {
    this.value = value;
  }

  TestClass.prototype.method = function (arg1, arg2, callback) {
    var value = this.value;
    setTimeout(function () {
      callback(null, arg1 + arg2 + value);
    }, 0);
  };

  TestClass.prototype.methodAsync = Meteor.promisify(TestClass.prototype.method);

  var instance = new TestClass(5);
  var asyncMethodWithContext = Meteor.promisify(instance.method, instance);

  Promise.all([
    instance.methodAsync(1, 2),
    asyncMethodWithContext(2, 3),
  ]).then(function (results) {
    test.equal(results, [8, 10]);
    done();
  });
});
