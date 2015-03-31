Tinytest.add("babel - runtime - template literals", function (test) {
  var dump = function (pieces) {
    return [_.extend({}, pieces),
            _.toArray(arguments).slice(1)];
  };
  var foo = 'B';
  test.equal(`\u0041${foo}C`, 'ABC');
  test.equal(dump`\u0041${foo}C`,
             [{0:'A', 1: 'C', raw: {value: ['\\u0041', 'C']}},
              ['B']]);
});

Tinytest.add("babel - runtime - classes", function (test) {
  (function () {
    class Foo {
      constructor(x) {
        this.x = x;
      }
    }

    test.throws(function () {
      Foo(); // called without `new`
    });

    test.equal((new Foo(3)).x, 3);
  })();

  (function () {
    class Bar {
      constructor(x) {
        this.x = x;
      }
    }
    class Foo extends Bar {}

    test.throws(function () {
      Foo(); // called without `new`
    });

    test.equal((new Foo(3)).x, 3);
    test.isTrue((new Foo(3)) instanceof Foo);
    test.isTrue((new Foo(3)) instanceof Bar);
  })();

  test.throws(function () {
    new Foo(); // use before definition
    class Foo {}
  });

  (function () {
    class Foo {
      static staticMethod() {
        return 'classy';
      }

      prototypeMethod() {
        return 'prototypical';
      }
    }

    test.equal(Foo.staticMethod(), 'classy');
    test.equal((new Foo).prototypeMethod(), 'prototypical');
  })();

  (function () {
    class Foo {
      static static1() {
        return 1;
      }
    }
    Foo.static2 = function () {
      return 2;
    };

    // static methods are inherited!
    class Bar extends Foo {}

    test.equal(Foo.static1(), 1);
    test.equal(Foo.static2(), 2);
    test.equal(Bar.static1(), 1);
    test.equal(Bar.static2(), 2);
  })();

  (function () {
    var frob = "inc";

    class Foo {
      static [frob](n) { return n+1; }
    }

    test.equal(Foo.inc(3), 4);
  })();
});

Tinytest.add("babel - runtime - block scope", function (test) {
  (function () {
    var buf = [];
    var thunks = [];
    var print = function (x) {
      buf.push(x);
    };
    var doLater = function (f) {
      thunks.push(f);
    };

    for (let i = 0; i < 3; i++) {
      print(i);
    }
    test.equal(buf, [0, 1, 2]);
    buf.length = 0;

    for (let i = 0; i < 3; i++) {
      doLater(function () {
        print(i);
      });
    }

    _.each(thunks, f => f());
    test.equal(buf, [0, 1, 2]);
  })();
});
