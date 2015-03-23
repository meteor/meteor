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
      Foo();
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
      Foo();
    });

    test.equal((new Foo(3)).x, 3);
    test.isTrue((new Foo(3)) instanceof Foo);
    test.isTrue((new Foo(3)) instanceof Bar);
  })();
});
