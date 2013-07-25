var UI = UI2;

Tinytest.add("ui - render", function (test) {
  (function () {
    var c = UI.Component.extend({
      render: function (buf) {
        buf.write("asdf");
      }
    });

    c.build();
    test.equal($(c._offscreen).html(), "asdf");
    c.destroy();
  })();

  (function () {
    var c = UI.Component.extend({
      render: function (buf) {
        buf.write("<div>asdf</div>");
      }
    });

    c.build();
    test.equal($(c._offscreen).html(), "<div>asdf</div>");
    c.destroy();
  })();

  (function () {
    var R = ReactiveVar("blam");
    var c = UI.Component.extend({
      render: function (buf) {
        buf.write(
          "foo",
          UI.Text.withData(function () { return R.get(); }),
          "bar");
      }
    });

    c.build();
    test.equal($(c._offscreen).html(), "fooblambar");
    R.set("ki");
    Deps.flush();
    test.equal($(c._offscreen).html(), "fookibar");
    c.destroy();
    test.equal(R.numListeners(), 0);
  })();



  (function () {
    var R = ReactiveVar("<hr>");
    var c = UI.Component.extend({
      render: function (buf) {
        buf.write(
          "foo",
          UI.HTML.withData(function () { return R.get(); }),
          "bar");
      }
    });

    c.build();
    test.equal($(c._offscreen).html(), "foo<hr>bar");
    R.set("<div>hi</div>");
    Deps.flush();
    test.equal($(c._offscreen).html(), "foo<div>hi</div>bar");
    c.destroy();
    test.equal(R.numListeners(), 0);
  })();


  (function () {
    var c = UI.Component.extend({
      render: function (buf) {
        // this isn't idiomatic but serves to test `child:`
        buf.write({child: UI.Text, props: {data: "hello"}});
      }
    });

    c.build();
    test.equal($(c._offscreen).html(), "hello");
    c.destroy();
  })();


  (function () {
    var R = ReactiveVar(1);
    var c = UI.Component.extend({
      init: function () {
        this.a = this.add(UI.Text.withData("hello"));
      },
      render: function (buf) {
        // use existing, inited (added) component!
        buf.write(this.a);
        // create dependency to test re-render behavior
        buf.write(String(R.get()));
      }
    });

    c.build();
    test.equal($(c._offscreen).html(), "hello1");
    test.equal(_.keys(c.children), [c.a.guid]);
    R.set(2);
    Deps.flush();
    test.equal($(c._offscreen).html(), "hello2");
    test.equal(_.keys(c.children), [c.a.guid]);
    c.destroy();
  })();

  (function () {
    var R = ReactiveVar(1);
    var which = ReactiveVar("H");
    var c = UI.Component.extend({
      init: function () {
        this.a = this.add(UI.Text.withData("hello"));
        this.b = this.add(UI.Text.withData("world"));
      },
      render: function (buf) {
        var self = this;
        // use existing, inited (added) component.
        // also, choose which one to use reactively!
        buf.write({child: function () {
          return which.get() === "H" ? self.a : self.b;
        }});
        // create dependency to test re-render behavior
        buf.write(String(R.get()));
      }
    });

    c.build();
    test.equal($(c._offscreen).html(), "hello1");
    test.equal(_.keys(c.children), [c.a.guid,
                                    c.b.guid]);
    test.isTrue(c.a.isAttached);
    test.isFalse(c.b.isAttached);
    R.set(2);
    Deps.flush();
    test.equal($(c._offscreen).html(), "hello2");
    test.equal(_.keys(c.children), [c.a.guid,
                                    c.b.guid]);
    test.isTrue(c.a.isAttached);
    test.isFalse(c.b.isAttached);
    which.set("W");
    Deps.flush();
    test.equal($(c._offscreen).html(), "world2");
    test.equal(_.keys(c.children), [c.a.guid, c.b.guid]);
    test.isFalse(c.a.isAttached);
    test.isTrue(c.b.isAttached);
    c.destroy();
    test.equal(R.numListeners(), 0);
    test.equal(which.numListeners(), 0);
  })();

  (function () {
    var R = ReactiveVar(1);
    var which = ReactiveVar("H");
    var name = ReactiveVar("David");

    // two factory (uninited) Components
    var Hello = UI.Component.extend({
      render: function (buf) {
        buf.write("hello", this.get());
      }
    });
    var World = UI.Component.extend({
      render: function (buf) {
        buf.write("world", this.get());
      }
    });

    var c = UI.Component.extend({
      render: function (buf) {
        var self = this;
        // also, choose which one to use reactively
        buf.write({child: function () {
          return which.get() === "H" ? Hello : World;
        }, props: {
          data: function () { return name.get(); }
        }});
        // create dependency to test re-render behavior
        buf.write(String(R.get()));
      }
    });

    c.build();
    test.equal($(c._offscreen).html(), "helloDavid1");
    test.equal(_.keys(c.children).length, 1);
    R.set(2);
    Deps.flush();
    test.equal($(c._offscreen).html(), "helloDavid2");
    test.equal(_.keys(c.children).length, 1);
    which.set("W");
    Deps.flush();
    test.equal($(c._offscreen).html(), "worldDavid2");
    test.equal(_.keys(c.children).length, 1);
    for (var theWorld in c.children) {}
    name.set("Wayne");
    Deps.flush();
    test.equal($(c._offscreen).html(), "worldWayne2");
    test.equal(_.keys(c.children), [theWorld]);
    c.destroy();
    test.equal(R.numListeners(), 0);
    test.equal(which.numListeners(), 0);
    test.equal(name.numListeners(), 0);
  })();

});