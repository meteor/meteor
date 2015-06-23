import assert from "assert";

describe("Babel", function() {
  let self = this;

  it("es6.arrowFunctions", () => {
    // This assertion will only pass if `this` is implicitly bound to the
    // same value as `self` above.
    assert.strictEqual(this, self);
  });

  it(`es6.templateLiterals`, () => {
    let second = 2;

    function strip(strings, ...values) {
      values.push("");
      return strings.map(
        (s, i) => s.replace(/ /g, "") + values[i]
      ).join("");
    }

    assert.strictEqual(
      strip`first
            ${second}
            third`,
      "first\n2\nthird"
    );
  });

  it("es6.classes", () => {
    let Base = class {
      constructor(arg) {
        this.value = arg;
      }
    };

    class Derived extends Base {
      constructor(arg) {
        super(arg + 1);
      }
    }

    let d = new Derived(1);

    assert.ok(d instanceof Derived);
    assert.ok(d instanceof Base);

    assert.strictEqual(d.value, 2);
  });

  it("es6.blockScoping", () => {
    let thunks = [];

    for (let i = 0; i < 10; ++i) {
      thunks.push(() => i);
    }

    assert.deepEqual(
      thunks.map(t => t()),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    );
  });

  it("es6.properties.shorthand", () => {
    let x = 1;
    let y = 2;

    assert.deepEqual({ x, y }, { x: 1, y: 2 });
  });

  it("es6.properties.computed", () => {
    let method = "asdf";

    let obj = {
      [method]() {
        return this;
      }
    };

    assert.strictEqual(obj.asdf(), obj);
  });

  it("es6.parameters.rest", () => {
    function f(a, b, ...[c, d]) { // TODO
      return [a, b, c, d];
    }

    assert.deepEqual(
      f(1, 2, 3, 4, 5, 6, 7, 8),
      [1, 2, 3, 4]
    );
  });

  it("es6.parameters.default", () => {
    function f(a, b = a + 1) {
      return a + b;
    }

    assert.strictEqual(f(2, 4), 6);
    assert.strictEqual(f(2), 5);
    assert.strictEqual(f(2, void 0), 5);
  });

  it("es6.spread", () => {
    class Summer {
      constructor(...args) {
        this.value = 0;
        args.forEach(arg => this.value += arg);
      }
    }

    let numbers = [];
    let limit = 10;
    for (let i = 0; i < limit; ++i) {
      numbers.push(i);
    }

    let s = new Summer(...numbers);
    assert.strictEqual(s.value, limit * (limit - 1) / 2);
  });

  it("es7.objectRestSpread", () => {
    let original = { a: 1, b: 2 };

    let { ...copy1 } = original;
    assert.deepEqual(copy1, original);

    let copy2 = { ...original };
    assert.deepEqual(copy2, original);
  });

  it("es6.destructuring", () => {
    let { x, y: [z, ...rest], ...objRest } = {
      x: "asdf",
      y: [1, 2, 3, 4],
      z: "zxcv"
    };

    assert.strictEqual(x, "asdf");
    assert.strictEqual(z, 1);
    assert.deepEqual(rest, [2, 3, 4]);
    assert.deepEqual(objRest, { z: "zxcv" });
  });

  it("es6.modules", () => {
    import f, { helper as h } from "./test-module";
    assert.strictEqual(f(), "default");
    assert.strictEqual(h(), "helper");
  });

  it("flow", () => {
    function add(...args: [number]): number {
      let sum = 0;
      args.forEach(arg => sum += arg);
      return sum;
    }

    assert.strictEqual(add(1, 2, 3, 4, 5), 15);
  });

  it("Promise", Promise.async(() => {
    var sleeper = new Promise(
      resolve => setTimeout(() => resolve("zxcv"), 10)
    );

    return Promise.resolve("asdf").then(result => {
      assert.strictEqual(result, "asdf");
      var zxcv = Promise.await(sleeper);
      assert.strictEqual(zxcv, "zxcv");
    });
  }));
});
