import assert from "assert";
import path from "path";
import { readFileSync } from "fs";
import { transform } from "@babel/core";
import { SourceMapConsumer } from "source-map";
import {
  default as testDefault,
  helper as testHelper,
} from "./test-module";

const hasOwn = Object.prototype.hasOwnProperty;

const isLegacy =
  process.env.IGNORE_NODE_MAJOR_VERSION &&
  !process.env.COMPILE_FOR_MODERN_BROWSERS;

const isNode8OrLater =
  !isLegacy && parseInt(process.versions.node) >= 8;

function removeBlankLines(string) {
  return string.split("\n").filter(Boolean).join("\n");
}

function count(string, substring) {
  return string.split(substring).length - 1;
}

describe("@meteorjs/babel", () => {
  import meteorBabel from "../index.js";

  it("should be able to parse non-standard syntax", () => {
    const ast = meteorBabel.parse("const copy = {...obj};");
    const prop = ast.program.body[0].declarations[0].init.properties[0];
    assert.strictEqual(prop.type, "SpreadElement");
  });

  it("should not force strict mode", () => {
    var sloppy = meteorBabel.compile("export var foo = 42;").code;
    assert.strictEqual(sloppy.indexOf("strict mode"), -1);

    // Of course the developer should still be able to add "use strict"
    // explicitly to her code.
    var strict = meteorBabel.compile([
      '"use strict";',
      "console.log(arguments.callee);"
    ].join("\n")).code;
    assert.strictEqual(strict.indexOf("use strict"), 1);
  });

  it("should minify the code provided", function() {
    const code = [
      "class Mangler {",
      "  constructor(program) {",
      "    this.program = program;",
      "  }",
      "}",
      "",
      "// need this since otherwise Mangler isn't used",
      "new Mangler();"
    ].join("\n");

    assert.strictEqual(
      meteorBabel.minify(code).code,
      "class Mangler{constructor(a){this.program=a}}new Mangler;"
    );
  });

  it("should inline process.env.NODE_ENV", function () {
    const code = "console.log(process.env.NODE_ENV);"
    assert.strictEqual(
      meteorBabel.minify(code, meteorBabel.getMinifierOptions({
        inlineNodeEnv: "oyez"
      })).code,
      'console.log("oyez");'
    );
  });

  it("should compose source maps correctly", function () {
    const source = [
      "const fn = (  x) => {",
      "",
      "  return   x +  1",
      "};"
    ].join("\n");

    const expected = [
      "var fn = function (x) {",
      "  return x + 1;",
      "};"
    ].join("\n");

    const babelOptions = meteorBabel.getDefaultOptions();
    babelOptions.plugins = [
      require("@babel/plugin-transform-arrow-functions"),
    ];
    babelOptions.sourceMaps = true;

    const result = meteorBabel.compile(source, babelOptions);

    assert.strictEqual(result.code, expected);

    assert.strictEqual(result.map.sourcesContent.length, 1);
    assert.strictEqual(result.map.sourcesContent[0], source);

    const smc = new SourceMapConsumer(result.map);

    function checkPos(generated, expectedOriginal) {
      const actualOriginal = smc.originalPositionFor(generated);
      assert.strictEqual(actualOriginal.line, expectedOriginal.line);
      assert.strictEqual(actualOriginal.column, expectedOriginal.column);
    }

    // |fn
    checkPos({ line: 1, column: 4 },
             { line: 1, column: 6 });

    // fn|
    checkPos({ line: 1, column: 6 },
             { line: 1, column: 8 });

    // |return
    checkPos({ line: 2, column: 2 },
             { line: 3, column: 2 });

    // |x + 1
    checkPos({ line: 2, column: 9 },
             { line: 3, column: 11 });

    // x| + 1
    checkPos({ line: 2, column: 10 },
             { line: 3, column: 12 });
  });

  it("should tolerate exported declarations named `module`", function () {
    const absId = require.resolve("d3/build/package.js");
    const source = readFileSync(absId, "utf8");
    const { code } = meteorBabel.compile(source);

    // Make sure the generated code uses a renamed module1 reference.
    assert.ok(/\bmodule1\.export\(/.test(code));

    // The d3/build/package.js file exports an identifier named module, so
    // we need to make sure Reify didn't mangle its name.
    assert.strictEqual(require("d3/build/package").module, "index");
  });

  it("can compile just module syntax and nothing else", function () {
    const source = [
      'import register from "./registry";',
      "register(async (a, b) => (await a) + (await b));",
    ].join("\n");

    const everythingResult = meteorBabel.compile(
      source,
      meteorBabel.getDefaultOptions({
        compileModulesOnly: false
      })
    );

    assert.ok(
      /\bmodule\.link\(/.test(everythingResult.code),
      everythingResult.code
    );

    assert.ok(
      /regeneratorRuntime.async\(/.test(everythingResult.code),
      everythingResult.code
    );

    const justModulesLegacy = meteorBabel.compile(
      source,
      meteorBabel.getDefaultOptions({
        compileModulesOnly: true
      })
    );

    assert.strictEqual(removeBlankLines(justModulesLegacy.code), [
      "var register;",
      'module.link("./registry", {',
      "  default: function (v) {",
      "    register = v;",
      "  }",
      "}, 0);",
      "register(async (a, b) => (await a) + (await b));",
    ].join("\n"));

    const justModulesModern = meteorBabel.compile(
      source,
      meteorBabel.getDefaultOptions({
        modernBrowsers: true,
        compileModulesOnly: true
      })
    );

    assert.strictEqual(removeBlankLines(justModulesModern.code), [
      "let register;",
      'module.link("./registry", {',
      "  default(v) {",
      "    register = v;",
      "  }",
      "}, 0);",
      "register(async (a, b) => (await a) + (await b));",
    ].join("\n"));
  });

  it("should import appropriate runtime helpers", function () {
    const absId = require.resolve("./obj-without-props.js");
    const { Test } = require(absId);

    const code = String(Test.prototype.constructor);
    assert.ok(/objectWithoutProperties/.test(code), code);

    const test = new Test({
      left: "asdf",
      right: "ghjk",
      middle: "zxcv",
      top: "qwer",
    });

    assert.strictEqual(test.left, "asdf");
    assert.strictEqual(test.right, "ghjk");
    assert.deepEqual(test.rest, {
      middle: "zxcv",
      top: "qwer",
    });

    const source = readFileSync(absId, "utf8");
    const result = meteorBabel.compile(source);

    assert.ok(
      /objectWithoutProperties\(/.test(result.code),
      result.code
    );

    assert.ok(
      /@babel\/runtime\/helpers\/objectWithoutProperties/.test(result.code),
      result.code
    );
  });

  it("should be tolerant of exporting undeclared identifiers", () => {
    import { GlobalArray } from "./undeclared-export.js";
    assert.strictEqual(GlobalArray, Array);
  });

  it("should not double-wrap module.runSetters expressions", () => {
    import { value, check } from "./runtime-double-pass";

    assert.strictEqual(value, 0);
    const a = 12, b = 34;
    check({ a, b });
    assert.strictEqual(value, a + b);

    const absId = require.resolve("./runtime-double-pass");
    const source = readFileSync(absId, "utf8");

    const defaultResult = meteorBabel.compile(source);
    assert.strictEqual(
      count(defaultResult.code, "runSetters"), 2,
      defaultResult.code
    );

    const modernResult = meteorBabel.compile(
      source,
      meteorBabel.getDefaultOptions({
        modernBrowsers: true
      })
    );

    assert.strictEqual(
      count(modernResult.code, "runSetters"), 2,
      modernResult.code
    );
  });

  it("should support compiling for a REPL", () => {
    const options = meteorBabel.getDefaultOptions({
      nodeMajorVersion: 8,
      compileForShell: true
    });
    const source = "console.log(module.constructor.prototype);";
    assert.strictEqual(
      meteorBabel.compile(source, options).code,
      source
    );
  });

  it("should support class properties", () => {
    import { Test } from "./class-properties.ts";
    const tsTest = new Test("asdf");
    assert.strictEqual(tsTest.property, 1234);
    assert.strictEqual(tsTest.value, "asdf");
    assert.strictEqual(typeof tsTest.result, "number");
    const jsTest = new (class { foo = 42 });
    assert.strictEqual(jsTest.foo, 42);
  });

  it("can compile TypeScript syntax", () => {
    const options = meteorBabel.getDefaultOptions({
      typescript: true,
    });

    assert.strictEqual(options.typescript, true);

    const result = meteorBabel.compile([
      "export namespace Test {",
      "  export const enabled = true;",
      "}",
    ].join("\n"), options);

    assert.strictEqual(result.code, [
      "module.export({",
      "  Test: function () {",
      "    return Test;",
      "  }",
      "});",
      "var Test;",
      "(function (Test) {",
      "  Test.enabled = true;",
      "})(Test || module.runSetters(Test = {}, [\"Test\"]));",
    ].join("\n"));
  });

  it("can compile TypeScript with import/export syntax", () => {
    import * as tsParent from "./typescript/parent";

    // The stringify/parse is necessary to remove Symbols.
    assert.deepEqual(JSON.parse(JSON.stringify(tsParent)), {
      def: "oyez",
      child: {
        default: "oyez",
        onoz: "onoz",
      },
    });

    const parentPath = path.join(__dirname, "typescript", "parent.ts");
    const parentSource = readFileSync(parentPath, "utf8");

    const options = meteorBabel.getDefaultOptions({
      typescript: true,
    });

    const result = meteorBabel.compile(parentSource, options);

    assert.strictEqual(result.code, [
      'module.export({',
      '  def: function () {',
      '    return def;',
      '  },',
      '  child: function () {',
      '    return child;',
      '  }',
      '});',
      'var def;',
      'module.link("./child", {',
      '  "default": function (v) {',
      '    def = v;',
      '  }',
      '}, 0);',
      'var child;',
      'module.link("./child", {',
      '  "*": function (v) {',
      '    child = v;',
      '  }',
      '}, 1);',
    ].join("\n"));
  });

  it("can handle JSX syntax in .tsx files", () => {
    const { Component } = require("./react.tsx");
    assert.strictEqual(typeof Component, "function");
    assert.strictEqual(String(Component), [
      'function Component() {',
      '  return /*#__PURE__*/React.createElement("div", null, "oyez");',
      '}',
    ].join("\n"));
  });

  it("imports @babel/runtime/helpers/objectSpread when appropriate", () => {
    const result = meteorBabel.compile(
      "console.log({ a, ...bs, c, ...ds, e })",
      meteorBabel.getDefaultOptions(),
    );
    assert.notStrictEqual(
      result.code.indexOf('module.link("@babel/runtime/helpers/objectSpread'),
      -1,
      result.code,
    );
  });

  it("should support meteorBabel.excludeFile", async () => {
    import { getCodeAsync } from "./not-transformed.js";
    assert.strictEqual(await getCodeAsync(), [
      '// This file is excluded from transformation in ./register.js.',
      'const rawCode = String(arguments.callee);',
      'exports.getCodeAsync = async function () {',
      '  return await rawCode.slice(',
      '    rawCode.indexOf("{") + 1,',
      '    rawCode.lastIndexOf("}"),',
      '  ).replace(/^\\s+|\\s+$/g, "");',
      '};',
    ].join("\n"))
  });
});

describe("Babel", function() {
  (isNode8OrLater ? xit : it)
  ("es3.propertyLiterals", () => {
    function getCatch(value) {
      let obj = { catch: value };
      return obj.catch;
    }

    assert.strictEqual(getCatch(42), 42);
    assert.ok(getCatch.toString().indexOf("obj.catch") >= 0);
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
      Function(transform(code, { presets: ["meteor"] }).code)();
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

    function g(convert, h, ...rest) {
      rest[0] = convert(rest[0]);
      return h(...rest);
    }

    assert.strictEqual(g(x => x + 1, y => y << 1, 3), 8);
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

  it("class properties", function () {
    class Bork {
      instanceProperty = "bork";
      boundFunction = () => {
        return this.instanceProperty;
      }

      static staticProperty = "blep";
      static staticFunction = function() {
        return this.staticProperty;
      }
    }

    const bork = new Bork;

    assert.strictEqual(hasOwn.call(bork, "boundFunction"), true);
    assert.strictEqual(
      hasOwn.call(Bork.prototype, "boundFunction"),
      false
    );

    assert.strictEqual((0, bork.boundFunction)(), "bork");

    assert.strictEqual(Bork.staticProperty, "blep");
    assert.strictEqual(Bork.staticFunction(), Bork.staticProperty);
  });

  it("async class methods", async function () {
    class C {
      async run(arg) {
        return (await arg) + 1;
      }
    }

    assert.strictEqual(
      await new C().run(Promise.resolve(1234)),
      1235
    );

    class D extends C {
      async go(arg) {
        return (await super.run(arg)) + 1;
      }
    }

    assert.strictEqual(
      await new D().run(Promise.resolve(3)),
      4
    );

    assert.strictEqual(
      await new D().go(Promise.resolve(3)),
      5
    );
  });

  const expectedFns = [
    "function jscript(",
    "function (", // Wrapper IIFE for f.
    "function f(",
    "function (", // Wrapper IIFE for C.
    "function C("
  ];

  (isNode8OrLater ? xit : it)
  ("jscript", function jscript() {
    let f = function f() {
      return f;
    };

    assert.strictEqual(f, f());

    const C = class C {};

    var code = jscript.toString();
    var fns = code.match(/\bfunction[^(]*\(/gm);

    assert.deepEqual(fns, expectedFns);
  });

  (isNode8OrLater ? xit : it)
  ("for-in loop sanitization", function loop() {
    Array.prototype.dummy = () => {};

    // Use the full version of sanitizeForInObject even though these tests
    // are almost certainly running in an environment that supports
    // defining non-enumerable properties.
    meteorBabelHelpers.sanitizeForInObject =
      meteorBabelHelpers._sanitizeForInObjectHard;

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

  it("TypeScript", () => {
    import { TSClass } from "./class";
    const tsObj = new TSClass("oyez");
    assert.strictEqual(tsObj.name, "oyez");
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

  it("async generator functions", async () => {
    async function *natRange(limit) {
      for (let x = 1; x <= limit; x = await addOne(x)) {
        yield x;
      }
    }

    async function addOne(n) {
      return n + 1;
    }

    let sum = 0;
    let limit = 10;
    let iter = natRange(limit);

    // Alas, an actual for-await loop won't work here until this issue is
    // resolved: https://github.com/babel/babel/issues/4969
    let info;
    while (! (info = await iter.next()).done) {
      sum += info.value;
    }

    assert.strictEqual(sum, limit * (limit + 1) / 2);
  });

  it("async arrow functions", async function () {
    const addOneAsync = async arg => (await arg) + 1;
    const sum = await addOneAsync(2345);
    assert.strictEqual(sum, 2346);

    const self = this;
    assert.strictEqual(self.isSelf, true);
    const checkThis = async () => assert.strictEqual(this, self);
    await checkThis();
    await checkThis.call({});
    await checkThis.call(null);
    await checkThis.call();
  }.bind({
    isSelf: true
  }));

  it("object ...spread works", function () {
    const versions = { ...process.versions };
    assert.strictEqual(versions.node, process.versions.node);
  });

  it("exponentiation operator", function () {
    assert.strictEqual(2 ** 13, Math.pow(2, 13));
  });

  it("optional chaining", function () {
    const a = {
      b: {
        c: {
          d: "abcd",
        },
      },
    };
    assert.strictEqual(a?.b?.c?.d, "abcd");

    assert.strictEqual(
      {
        foo: {
          bar: {
            baz: true
          }
        }
      }.foo.barf?.baz,
      void 0,
    );

    const api = {
      method() {
        return "yay";
      },
    };

    assert.strictEqual(api.method?.(), "yay");
    assert.strictEqual(api.schmethod?.(), void 0);
  });

  it("nullish coalescing", function () {
    assert.strictEqual(0 ?? 1234, 0);
    assert.strictEqual(null ?? 2345, 2345);
    assert.strictEqual(void 0 ?? 3456, 3456);
  });

  it("optional catch parameter", function () {
    let caught = false;
    try {
      throw "expected";
    } catch {
      caught = true;
    }
    assert.strictEqual(caught, true);
  });
});

require("./decorators.js");

describe("Reify", function () {
  (isLegacy || !isNode8OrLater ? xit : it)
  ("should declare imported symbols with block scope", function () {
    import def, { value } from "./export-value-a.js";
    assert.strictEqual(def, "value: a");

    if (value === "a") {
      import def, { value as bVal } from "./export-value-b.js";
      assert.strictEqual(def, "value: b");
      assert.strictEqual(bVal, "b");
      assert.strictEqual(value, "a");
    }

    assert.strictEqual(def, "value: a");
    assert.strictEqual(value, "a");
  });

  it("should support export-default-from syntax", function () {
    import { a, aNs as aNsReexported } from "./export-default-from.js";
    import * as aNsOriginal from "./export-value-a.js";
    assert.strictEqual(a, "value: a");
    assert.strictEqual(aNsOriginal, aNsReexported);
  });

  it("should work for imports in generator functions", function () {
    function *g() {
      {
        import { value } from "./export-value-a.js";
        yield value;
      }

      {
        import { value } from "./export-value-b.js";
        yield value;
      }
    }

    var gen = g();
    assert.deepEqual(gen.next(), { value: "a", done: false });
    assert.deepEqual(gen.next(), { value: "b", done: false });
    assert.deepEqual(gen.next(), { value: void 0, done: true });
  });

  it("should work after await in async functions", function () {
    return async function () {
      import { value } from "./export-value-a.js";

      assert.strictEqual(
        await Promise.resolve("asdf"),
        "asdf"
      );

      assert.strictEqual(value, "a");
    }();
  });
});

export const instance = new (class {
  run() {
    import assert from "assert";
    return assert;
  }
});

describe("Meteor bug #8595", function () {
  it("should be fixed", function () {
    assert.strictEqual(instance.run(), require("assert"));
  });
});

describe("dynamic import(...)", function () {
  import meteorBabel from "../index.js";

  it("should compile to module.dynamicImport(...)", function () {
    const code = 'wait(import("meteor/dynamic-import"));';
    assert.strictEqual(
      meteorBabel.compile(code).code,
      code.replace("import", "module.dynamicImport")
    );
  });
});
