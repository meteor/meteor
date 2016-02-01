import assert from "assert";
import {transform} from "babel-core";
import {
  default as testDefault,
  helper as testHelper,
} from "./test-module";

describe("meteor-babel", () => {
  const meteorBabel = require("../index.js");

  it("should be able to parse non-standard syntax", () => {
    const ast = meteorBabel.parse("const copy = {...obj};");
    const prop = ast.program.body[0].declarations[0].init.properties[0];
    assert.strictEqual(prop.type, "SpreadProperty");
  });
});

describe("Babel", function() {
  it("es3.{property,memberExpression}Literals", () => {
    function getCatch(value) {
      let obj = { catch: value };
      return obj.catch;
    }

    assert.strictEqual(getCatch(42), 42);
    assert.ok(getCatch.toString().indexOf('obj["catch"]') >= 0);
    assert.ok(getCatch.toString().indexOf('"catch":') >= 0);
  });

  let self = this;
  it("es6.arrowFunctions", () => {
    // This assertion will only pass if `this` is implicitly bound to the
    // same value as `self` above.
    assert.strictEqual(this, self);
  });

  it("es6.literals", () => {
    assert.strictEqual(0o777, 511);
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

  it("es6.constants", function () {
    let code = `
const val = "oyez";
val = "zxcv";`;

    try {
      transform(code, { presets: ["meteor"] });
    } catch (error) {
      assert.ok(/"val" is read-only/.test(error.message));
      return;
    }

    assert.ok(false, "should have returned from the catch block");
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
    function f(a, b, ...cd) {
      return [a, b, cd[0], cd[1]];
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

  it("es6.forOf", () => {
    let sum = 0;
    for (let n of [1, 2, 3, 4, 5]) {
      sum += n;
    }
    assert.strictEqual(sum, 15);
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
    assert.strictEqual(testDefault(), "default");
    assert.strictEqual(testHelper(), "helper");
  });

  it("es7.trailingFunctionCommas", () => {
    // TODO Shouldn't this work for arrow functions too?
    function add3(a, b, c,) { return a + b + c; }
    assert.strictEqual(add3(1, 2, 3), 6);
  });

  it("react", function react() {
    let calledCreateClass = false;
    let calledCreateElement = false;

    const React = {
      createClass(spec) {
        assert.strictEqual(spec.displayName, "Oyez");
        calledCreateClass = true;
        spec.render();
      },

      createElement(name) {
        assert.strictEqual(name, "div");
        calledCreateElement = true;
      }
    }

    var Oyez = React.createClass({
      render() {
        return <div id="oyez"></div>;
      }
    });

    assert.strictEqual(calledCreateClass, true);
    assert.strictEqual(calledCreateElement, true);
  });

  const expectedFns = [
    "function jscript(",
    "function (", // Wrapper IIFE for f.
    "function f(",
    "function (", // Wrapper IIFE for C.
    "function C("
  ];

  it("jscript", function jscript() {
    let f = function f() {
      return f;
    };

    assert.strictEqual(f, f());

    const C = class C {};

    var code = jscript.toString();
    var fns = code.match(/\bfunction[^(]*\(/gm);

    assert.deepEqual(fns, expectedFns);
  });

  it("for-in loop sanitization", function loop() {
    Array.prototype.dummy = () => {};

    let sparseArray = [];
    sparseArray[2] = "c";
    sparseArray[0] = "a";

    let keys = [];
    for (let index in sparseArray) {
      keys.push(index);
    }

    assert.deepEqual(keys, [0, 2]);

    delete Array.prototype.dummy;
  });

  it("flow", () => {
    function add(...args: [number]): number {
      let sum = 0;
      args.forEach(arg => sum += arg);
      return sum;
    }

    assert.strictEqual(add(1, 2, 3, 4, 5), 15);
  });

  it("async/await", async () => {
    var two = Promise.resolve(2);
    var three = Promise.resolve(3);
    var ten = await new Promise(resolve => resolve(10));

    assert.strictEqual(
      (await two) + (await three) + ten,
      await 15
    );
  });
});
