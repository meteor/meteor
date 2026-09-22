const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Load the vendored modules without booting Mocha's browser runner. This
// exercises the actual utilities without requiring a DOM or running Babel.
const source = fs.readFileSync(path.join(__dirname, "mocha.js"), "utf8");
const bootstrap = source.indexOf('// The global object is "self" in Web Workers.');
assert.notStrictEqual(bootstrap, -1);
const context = vm.createContext({ console: { log() {} }, process: {} });
vm.runInContext(
  source.slice(0, bootstrap) + '\nthis.utils = require("utils");\n})();',
  context,
);

function clean(input) {
  context.input = input;
  return vm.runInContext("utils.clean(input)", context, { timeout: 2000 });
}

function highlight(input) {
  const code = { innerHTML: input };
  context.document = {
    getElementById() {
      return { getElementsByTagName() { return [code]; } };
    },
  };
  vm.runInContext('utils.highlightTags("code")', context, { timeout: 2000 });
  return code.innerHTML;
}

describe("vendored browser Mocha utilities", function () {
  this.timeout(5000);

  it("removes the function wrapper and preserves nested braces", function () {
    assert.strictEqual(
      clean('function () {\n  if (ready) {\n    run();\n  }\n}'),
      'if (ready) {\n  run();\n}',
    );
  });

  it("removes arrow function wrappers and normalizes indentation", function () {
    assert.strictEqual(clean('() => {\n\treturn 1;\n}'), 'return 1;');
  });

  it("cleans empty functions", function () {
    assert.strictEqual(clean('function () {\n}'), '');
  });

  it("preserves braces without preceding whitespace", function () {
    assert.strictEqual(clean('value}'), 'value}');
  });

  it("handles long whitespace runs with a non-brace ending", function () {
    for (const suffix of ['!', '\u25ce']) {
      assert.strictEqual(clean(' '.repeat(200000) + suffix), suffix);
    }
  });

  it("handles long trailing whitespace before a closing brace", function () {
    assert.strictEqual(clean('function () {\n  run();' + ' '.repeat(200000) + '}'), 'run();');
  });

  it("highlights integers and decimals once each", function () {
    assert.strictEqual(
      highlight('12 3.45'),
      '<span class="number">12</span> <span class="number">3.45</span>',
    );
  });

  it("keeps a dot without fractional digits outside the number", function () {
    assert.strictEqual(highlight('12.'), '<span class="number">12</span>.');
  });

  it("handles long digit runs without a fractional part", function () {
    const digits = '1'.repeat(200000);
    for (const suffix of ['.', '\u25ce']) {
      assert.strictEqual(highlight(digits + suffix), '<span class="number">' + digits + '</span>' + suffix);
    }
  });
});
