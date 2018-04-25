// These are tests of Babel's generated output.  Write tests here when a runtime
// test won't do.  Some tests also serve to catch when Babel changes its output,
// such as when it changes its runtime helpers!

function transform(input) {
  return Babel.compile(input).code;
};

function contains(haystack, needle) {
  return haystack.indexOf(needle) >= 0;
};

Tinytest.add("ecmascript - transpilation - const", (test) => {
  // make sure `const` is turned into `var` (rather than passing
  // through, such as when you have es6.blockScoping on but
  // es6.constants off)
  const output = transform('const x = 5;');
  test.isFalse(contains(output, 'const'));
  test.isTrue(contains(output, 'var'));
});

Tinytest.add("ecmascript - transpilation - class methods", (test) => {
  const output = transform(
`class Foo {
  static staticMethod() {
    return 'classy';
  }

  prototypeMethod() {
    return 'prototypical';
  }

  [computedMethod]() {
    return 'computed';
  }
}`);

  // test that we are in "loose" mode and methods of classes are still
  // assigned in a simple matter that does rely on Object.defineProperty.
  test.isTrue(contains(output, 'Foo.staticMethod = function staticMethod('));
  test.isTrue(contains(output,
                       '.prototypeMethod = function prototypeMethod('));
  test.isTrue(contains(output, '[computedMethod] = function ('));
  test.isFalse(contains(output, 'createClass'));
});

Tinytest.add("ecmascript - transpilation - helpers - classCallCheck", (test) => {
  const output = transform(`
class Foo {
  constructor(x) {
    this.x = x;
  }
}`);

  // Babel 7 no longer imports the classCallCheck helper in loose mode.
  test.equal(output, [
    "var Foo = function Foo(x) {",
    "  this.x = x;",
    "};"
  ].join("\n"));
});

Tinytest.add("ecmascript - transpilation - helpers - inherits", (test) => {
  const output = transform(`
class Foo {}
class Bar extends Foo {}
`);

  test.isTrue(/helpers\/(builtin\/)?inherits/.test(output));
});

Tinytest.add("ecmascript - transpilation - helpers - bind", (test) => {
  const output = transform(
    "var foo = new Foo(...oneTwo, 3);"
  );

  test.isTrue(output.match(/@babel\/runtime\/helpers\/construct\b/));
});

Tinytest.add("ecmascript - transpilation - helpers - extends", (test) => {
  const output = transform(`
  var full = {a:1, ...middle, d:4};
`);

  test.isTrue(/helpers\/(builtin\/)?(extends|objectSpread)/.test(output));
});

Tinytest.add("ecmascript - transpilation - helpers - objectWithoutProperties", (test) => {
  const output = transform(`
var {a, ...rest} = obj;
`);

  test.isTrue(/helpers\/(builtin\/)?objectWithoutProperties/.test(output));
});

Tinytest.add("ecmascript - transpilation - helpers - objectDestructuringEmpty", (test) => {
  const output = transform(`
var {} = null;
`);

  test.isTrue(/helpers\/(builtin\/)?objectDestructuringEmpty/.test(output));
});

Tinytest.add("ecmascript - transpilation - helpers - taggedTemplateLiteralLoose", (test) => {
  const output = transform(`
var x = asdf\`A\${foo}C\`
`);

  test.isTrue(/helpers\/(builtin\/)?taggedTemplateLiteralLoose/.test(output));
});

Tinytest.add("ecmascript - transpilation - helpers - createClass", (test) => {
  const output = transform(`
class Foo {
  get blah() { return 123; }
}
`);

  test.isTrue(/helpers\/(builtin\/)?createClass/.test(output));
});

Tinytest.add("ecmascript - transpilation - flow", (test) => {
  const output = transform(
    'var foo = function (one: any, two: number, three?): string {};');
  test.isTrue(contains(output, '(one, two, three)'));
});
