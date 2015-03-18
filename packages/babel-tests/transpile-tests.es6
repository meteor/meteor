// These tests are of Babel's output.  They document what we require
// from Babel, and catch any changes in Babel's output.  They also
// serve as examples.

// TODO: Make a nice page showing these examples, with commentary!

var groups = [
  {
    groupName: 'arrow functions',
    features: ['es6.arrowFunctions'],
    cases: [
      {
        name: 'basic',
        input: 'var square = (x) => x*x;',
        expected:
        ` | var square = function (x) {
          |   return x * x;
          | };`
      }
    ]
  },
  {
    groupName: 'block scoping',
    features: ['es6.blockScoping'],
    cases: [
      {
        name: 'basic let',
        input: 'let x = 3; print(x)',
        expected: 'var x = 3;print(x);'
      }
    ]
  },
  {
    groupName: 'template literals',
    features: ['es6.templateLiterals'],
    cases: [
      {
        name: 'basic multiline',
        input: 'print(`foo\nbar`)',
        expected: 'print("foo\\nbar");'
      },
      {
        name: 'basic interpolation',
        input: 'print(`Yo, ${name}!`)',
        expected: 'print("Yo, " + name + "!");'
      },
      {
        name: 'basic tag',
        input: 'print(fn`Yo, ${name}!`)',
        expected: 'print(fn(babelHelpers.taggedTemplateLiteral(["Yo, ", "!"], ["Yo, ", "!"]), name));'
      },
      {
        name: 'tag raw',
        input: 'print(fn`Yo,\\u0020${name}!`)',
        expected: 'print(fn(babelHelpers.taggedTemplateLiteral(["Yo, ", "!"], ["Yo,\\\\u0020", "!"]), name));'
      }
    ]
  }
];

var stripPipes = function (str) {
  var lines = str.split('\n');
  if (lines.length && /^\s*\|/.test(lines[0])) {
    var match = /^\s*\|(\s*)/.exec(lines[0]);
    var spacesAfterPipe = match[1].length;
    return _.map(lines, function (line) {
      var prefix = line.match(/(^\s*\|)|/)[0];
      if (! prefix) {
        return line;
      }
      return line.slice(prefix.length + spacesAfterPipe);
    }).join('\n');
  } else {
    return str;
  }
};

_.each(groups, function (group) {
  if (! (group.features && group.features.length)) {
    throw new Error("Non-empty `features` array required in group");
  }
  _.each(group.cases, function (c) {
    Tinytest.add("babel - transpilation - " + group.groupName + " - " + c.name,
                 function (test) {
                   test.equal(
                     Babel.transform(c.input, {
                       whitelist: group.features,
                       externalHelpers: true
                     }).code,
                     stripPipes(c.expected));
                 });
  });
});
