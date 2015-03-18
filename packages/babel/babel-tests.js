var ARROW_FUNCTIONS = 'es6.arrowFunctions';
var BLOCK_SCOPING = 'es6.blockScoping';
var TEMPLATE_LITERALS = 'es6.templateLiterals';

// These tests serve as documentation and regression tests for what
// we expect out of Babel.

// TODO: Come up with a standardized way to express these.
// Maybe use multiline backtick strings.

Tinytest.add("babel - arrow functions", function (test) {
  test.equal(Babel.transform('var square = (x) => x*x;',
                             { whitelist: [ARROW_FUNCTIONS],
                               compact: true }).code,
             'var square=function(x){return x * x;};');
});

Tinytest.add("babel - let", function (test) {
  test.equal(Babel.transform('let x = 3; print(x)',
                             { whitelist: [BLOCK_SCOPING] }).code,
             'var x = 3;print(x);');
});

Tinytest.add("babel - template strings", function (test) {
  test.equal(Babel.transform('print(`foo\nbar`)',
                             { whitelist: [TEMPLATE_LITERALS] }).code,
             'print("foo\\nbar");');

  test.equal(Babel.transform('print(`Yo, ${name}!`)',
                             { whitelist: [TEMPLATE_LITERALS] }).code,
             'print("Yo, " + name + "!");');

  // Oh dear, we need a runtime library to improve on this!
  test.equal(Babel.transform('print(fn`Yo, ${name}!`)',
                             { whitelist: [TEMPLATE_LITERALS] }).code,
             'var _taggedTemplateLiteral = function (strings, raw) { return Object.freeze(Object.defineProperties(strings, { raw: { value: Object.freeze(raw) } })); };' +
             '\n\n' +
             'print(fn(_taggedTemplateLiteral(["Yo, ", "!"], ["Yo, ", "!"]), name));');
});
