const isNode8OrLater = Meteor.isServer &&
  parseInt(process.versions.node) >= 8;

Tinytest.add("ecmascript - runtime - template literals", (test) => {
  function dump(strings, ...expressions) {
    const copy = Object.create(null);
    Object.assign(copy, strings);
    copy.raw = strings.raw;
    return [copy, expressions];
  };

  const foo = "B";

  test.equal(`\u0041${foo}C`, "ABC");

  test.equal(dump`\u0041${foo}C`, [{
    0: "A",
    1: "C",
    raw: ["\\u0041", "C"]
  }, [
    "B"
  ]]);
});

Tinytest.add("ecmascript - runtime - classes - basic", (test) => {
  {
    class Foo {
      constructor(x) {
        this.x = x;
      }
    }

    // Babel 7 no longer forbids constructor calls in loose mode.
    // test.throws(() => {
    //   Foo(); // called without `new`
    // });

    test.equal((new Foo(3)).x, 3);
  }

  {
    class Bar {
      constructor(x) {
        this.x = x;
      }
    }
    class Foo extends Bar {}

    // Babel 7 no longer forbids constructor calls in loose mode.
    // test.throws(() => {
    //   Foo(); // called without `new`
    // });

    test.equal((new Foo(3)).x, 3);
    test.isTrue((new Foo(3)) instanceof Foo);
    test.isTrue((new Foo(3)) instanceof Bar);
  }

  {
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
  }
});

Tinytest.add("ecmascript - runtime - classes - use before declare", (test) => {
  const x = function asdf() {};
  if (typeof asdf === 'function') {
    // We seem to be in IE 8, where function names leak into the enclosing
    // scope, contrary to the spec.  In this case, Babel does not (currently)
    // throw an error if you use a class before you declare it.  (Of course,
    // any other browser can tell the developer they screwed up!)
    test.expect_fail();
  }

  test.throws(() => {
    new Foo(); // use before definition
    class Foo {}
  });
});


Tinytest.add("ecmascript - runtime - classes - inheritance", (test) => {

  // uses `babelHelpers.inherits`
  {
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
  }

  {
    const buf = [];
    class Foo {
      constructor() {
        buf.push('hi');
      }
    }

    class Bar extends Foo {}

    new Bar();
    // derived class with no constructor gets a default constructor
    // that calls the super constructor
    test.equal(buf, ['hi']);
  }
});

Tinytest.add("ecmascript - runtime - classes - computed props", (test) => {
  {
    const frob = "inc";

    class Foo {
      static [frob](n) { return n+1; }
    }

    test.equal(Foo.inc(3), 4);
  }
});

if (Meteor.isServer) {
  // getters and setters don't work in all clients, but they should work
  // in classes on browsers that support them in the first place, and on
  // the server.  (Technically they just need a working
  // Object.defineProperty, found in IE9+ and all modern environments.)
  Tinytest.add("ecmascript - runtime - classes - getters/setters", (test) => {
    // uses `babelHelpers.createClass`
    class Foo {
      get two() { return 1+1; }
      static get three() { return 1+1+1; }
    }

    test.equal((new Foo).two, 2);
    test.equal(Foo.three, 3);
  });
}

export const testExport = "oyez";

Tinytest.add("ecmascript - runtime - classes - properties", (test) => {
  class ClassWithProperties {
    property = ["prop", "rty"].join("e");
    static staticProp = 1234;

    check = (self) => {
      import { testExport as oyez } from "./runtime-tests.js";
      test.equal(oyez, "oyez");
      test.isTrue(self === this);
      test.equal(this.property, "property");
    };

    method() {
      import { testExport as oyez } from "./runtime-tests.js";
      test.equal(oyez, "oyez");
    }
  }

  test.equal(ClassWithProperties.staticProp, 1234);

  const cwp = new ClassWithProperties();

  cwp.check(cwp);

  // Check binding of arrow function.
  cwp.check.call(null, cwp);

  cwp.method();
});

Tinytest.add("ecmascript - runtime - block scope", (test) => {
  {
    const buf = [];
    const thunks = [];
    function print(x) {
      buf.push(x);
    };
    function doLater(f) {
      thunks.push(f);
    };

    for (let i = 0; i < 3; i++) {
      print(i);
    }
    test.equal(buf, [0, 1, 2]);
    buf.length = 0;

    for (let i = 0; i < 3; i++) {
      doLater(() => {
        print(i);
      });
    }

    _.each(thunks, f => f());
    test.equal(buf, [0, 1, 2]);
  }
});

Tinytest.add("ecmascript - runtime - classes - super", (test) => {
  {
    class Class1 {
      foo() { return 123; }
      static bar() { return 1; }
    }
    class Class2 extends Class1 {}
    class Class3 extends Class2 {
      foo() {
        return super.foo() + Class3.bar();
      }
    }

    test.equal((new Class3).foo(), 124);
  }

  {
    class Foo {
      constructor(value) { this.value = value; }
      x() { return this.value; }
    }

    class Bar extends Foo {
      constructor() { super(123); }
      x() { return super.x(); }
    }

    test.equal((new Bar).x(), 123);
  }
});

Tinytest.add("ecmascript - runtime - object rest/spread", (test) => {
  const middle = {b:2, c:3};
  // uses `babelHelpers._extends`
  const full = {a:1, ...middle, d:4};
  test.equal(full, {a:1, b:2, c:3, d:4});
});

Tinytest.add("ecmascript - runtime - spread args to new", (test) => {

  const Foo = function (one, two, three) {
    test.isTrue(this instanceof Foo);
    test.equal(one, 1);
    test.equal(two, 2);
    test.equal(three, 3);
    this.created = true;
  };

  const oneTwo = [1, 2];

  // uses `babelHelpers.bind`
  const foo = new Foo(...oneTwo, 3);
  test.isTrue(foo.created);
});

Tinytest.add("ecmascript - runtime - Map spread", (test) => {
  const map = new Map;

  map.set(0, 1);
  map.set(1, 2);
  map.set(2, 3);

  test.equal([...map], [
    [0, 1],
    [1, 2],
    [2, 3]
  ]);
});

Tinytest.add("ecmascript - runtime - Set spread", (test) => {
  const set = new Set;

  set.add("a");
  set.add(1);
  set.add(false);

  test.equal([...set], ["a", 1, false]);
});

Tinytest.add("ecmascript - runtime - destructuring", (test) => {
  const obj = {a:1, b:2};
  const {a, ...rest} = obj;
  test.equal(a, 1);
  test.equal(rest, {b:2});

  const {} = {};

  test.throws(() => {
    const {} = null;
  });

  const [x, y, z] = function*() {
    let n = 1;
    while (true) {
      yield n++;
    }
  }();

  test.equal(x, 1);
  test.equal(y, 2);
  test.equal(z, 3);
});

Tinytest.addAsync("ecmascript - runtime - misc support", (test, done) => {
  // Verify that the runtime was installed.
  test.equal(typeof meteorBabelHelpers, "object");
  test.equal(typeof meteorBabelHelpers.sanitizeForInObject, "function");

  class Base {
    constructor(...args) {
      this.sum = 0;
      args.forEach(arg => this.sum += arg);
    }

    static inherited() {
      return "inherited";
    }
  }

  class Derived extends Base {
    constructor() {
      super(1, 2, 3);
    }
  }

  // Check that static methods are inherited.
  test.equal(Derived.inherited(), "inherited");

  const d = new Derived();
  test.equal(d.sum, 6);

  const expectedError = new Error("expected");

  Promise.resolve("working").then(result => {
    test.equal(result, "working");
    throw expectedError;
  }).catch(error => {
    test.equal(error, expectedError);
    if (Meteor.isServer) {
      const Fiber = Npm.require("fibers");
      // Make sure the Promise polyfill runs callbacks in a Fiber.
      test.instanceOf(Fiber.current, Fiber);
    }
  }).then(done, error => test.exception(error));
});

Tinytest.addAsync("ecmascript - runtime - async fibers", (test, done) => {
  if (! Meteor.isServer) {
    return done();
  }

  const Fiber = Npm.require("fibers");

  function wait() {
    return new Promise(resolve => setTimeout(resolve, 10));
  }

  async function check() {
    const fiberBeforeAwait = Fiber.current;
    await wait();
    const fiberAfterAwait = Fiber.current;
    test.isTrue(fiberBeforeAwait instanceof Fiber);
    test.isTrue(fiberBeforeAwait === fiberAfterAwait);
  }

  check().then(done);
});
