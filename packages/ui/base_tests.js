
/*
THESE TESTS ARE OUT OF DATE.

TODO: WRITE TESTS AGAINST THE LATEST base.js

Tinytest.add("ui - Component basics", function (test) {
  var Foo = UI.Component.extend();
  var Bar = Foo.extend({x: 1, y: 2});
  var Baz = Bar.extend({y: 3, z: 4});

  test.equal(typeof Foo.x, 'undefined');
  test.equal(typeof Foo.y, 'undefined');
  test.equal(typeof Foo.z, 'undefined');
  test.equal(Bar.x, 1);
  test.equal(Bar.y, 2);
  test.equal(typeof Bar.z, 'undefined');
  test.equal(Baz.x, 1);
  test.equal(Baz.y, 3);
  test.equal(Baz.z, 4);

  // _super

  test.equal(Foo._super, UI.Component);
  test.equal(Bar._super, Foo);
  test.equal(Baz._super, Bar);

  // isa

  test.isTrue(UI.isComponent(UI.Component));
  test.isTrue(UI.isComponent(Foo));
  test.isTrue(UI.isComponent(Bar));
  test.isTrue(UI.isComponent(Baz));
  test.isTrue(UI.Component.isa(UI.Component));
  test.isFalse(UI.Component.isa(Foo));
  test.isFalse(UI.Component.isa(Bar));
  test.isFalse(UI.Component.isa(Baz));
  test.isTrue(Foo.isa(UI.Component));
  test.isTrue(Foo.isa(Foo));
  test.isFalse(Foo.isa(Bar));
  test.isFalse(Foo.isa(Baz));
  test.isTrue(Bar.isa(UI.Component));
  test.isTrue(Bar.isa(Foo));
  test.isTrue(Bar.isa(Bar));
  test.isFalse(Bar.isa(Baz));
  test.isTrue(Baz.isa(UI.Component));
  test.isTrue(Baz.isa(Foo));
  test.isTrue(Baz.isa(Bar));
  test.isTrue(Baz.isa(Baz));

  test.isFalse(UI.isComponent({}));
  test.isFalse(UI.isComponent(null));
  test.isFalse(UI.isComponent());
  test.isFalse(UI.isComponent(function () {}));
  test.isFalse(Foo.isa({}));
  test.isFalse(Foo.isa(null));
  test.isFalse(Foo.isa());
  test.isFalse(Foo.isa(function () {}));

  // guid

  var a = UI.Component.guid,
      b = Foo.guid,
      c = Bar.guid,
      d = Baz.guid;

  test.isTrue(a > 0);
  test.isTrue(b > 0);
  test.isTrue(c > 0);
  test.isTrue(d > 0);
  test.isTrue(a !== b);
  test.isTrue(a !== c);
  test.isTrue(a !== d);
  test.isTrue(b !== c);
  test.isTrue(b !== d);
  test.isTrue(c !== d);
});

Tinytest.add("ui - Component init/destroy", function (test) {
  var buf = [];

  var x = UI.Component.extend({
    init: function () {
      test.isTrue(this.isInited);
      test.isFalse(this.isAssembled);
      test.isFalse(this.isDestroyed);
      buf.push('init');
    },
    destroyed: function () {
      test.isTrue(this.isInited);
      test.isFalse(this.isAssembled);
      test.isTrue(this.isDestroyed);
      buf.push('destroyed');
    }
  });
  test.isFalse(this.isInited);
  test.isFalse(this.isAssembled);
  test.isFalse(this.isDestroyed);
  test.equal(buf, []);
  x.makeRoot();
  test.equal(buf, ['init']);
  x.destroy();
  test.equal(buf, ['init', 'destroyed']);

  buf.length = 0;
  x = UI.Component.extend({
    init: function () { buf.push('init'); },
    destroyed: function () { buf.push('destroyed'); }
  });
  test.throws(function () {
    x.destroy();
  });
  x.makeRoot();
  test.throws(function () {
    x.makeRoot();
  });
  test.throws(function () {
    var y = x.extend();
  });
  test.equal(buf, ['init']);
  x.destroy();
  x.destroy();
  test.equal(buf, ['init', 'destroyed']);
  test.throws(function () {
    x.makeRoot();
  });
  test.throws(function () {
    var y = x.extend();
  });

  buf.length = 0;
  x = UI.Component.extend({
    init: function () { buf.push('init'); },
    destroyed: function () { buf.push('destroyed'); }
  });
  var y = x.extend({
    init: function () { buf.push('init2'); },
    destroyed: function () { buf.push('destroyed2'); }
  });
  test.equal(buf, []);
  y.makeRoot();
  test.equal(buf, ['init', 'init2']);
  y.destroy();
  test.equal(buf, ['init', 'init2', 'destroyed', 'destroyed2']);

  buf.length = 0;
  var z = x.extend();
  z.makeRoot();
  z.destroy();
  test.equal(buf, ['init', 'destroyed']);
});

Tinytest.add("ui - Component add/remove", function (test) {
  var x = UI.Component.extend();
  var y = UI.Component.extend();

  test.throws(function () {
    x.add(y);
  });

  test.isFalse(x.isInited);
  x.makeRoot();
  test.isTrue(x.isInited);
  test.isFalse(y.isInited);
  test.isFalse(x.hasChild(y));
  test.equal(_.keys(x.children), []);
  test.equal(_.keys(y.children), []);

  x.add(y);
  test.isTrue(y.isInited);
  test.equal(y.parent, x);
  test.isTrue(x.hasChild(y));
  test.isFalse(y.hasChild(x));
  test.equal(_.keys(x.children), [String(y.guid)]);
  test.equal(_.keys(y.children), []);
  test.equal(x.children[y.guid], y);

  var z = UI.Component.extend();
  x.add(z);
  test.isTrue(z.isInited);
  test.equal(z.parent, x);
  test.isTrue(x.hasChild(z));
  test.isFalse(z.hasChild(x));
  test.equal(_.keys(x.children).sort(),
             [String(y.guid), String(z.guid)].sort());
  test.equal(_.keys(z.children), []);
  test.equal(x.children[z.guid], z);

  x.remove(y);
  z.remove();
  test.isFalse(x.hasChild(y));
  test.isFalse(x.hasChild(z));
  test.equal(_.keys(x.children), []);
  // children are destroyed
  test.isTrue(y.isDestroyed);
  test.isTrue(z.isDestroyed);
  // parent pointers remain
  test.equal(y.parent, x);
  test.equal(z.parent, x);
  test.throws(function () {
    y.remove();
  });
  test.throws(function () {
    z.remove();
  });
  test.throws(function () {
    x.remove(y);
  });
  test.throws(function () {
    x.remove(z);
  });
});

*/