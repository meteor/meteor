Tinytest.add('minifier-js - verify JS minification', (test) => {
  const checkMinified = (js, expected, desc) => {
    const result = meteorJsMinify(js);
    console.log(result.code);
    test.equal(result.code, expected, desc);
  };

  checkMinified(
    'function add(first,second){return first + second; }\n',
    'function add(n,d){return n+d}',
    'simple name mangling check',
  );
  checkMinified(
    'const person = {};person["name"] = "brian";person["age"] = 100; function printName(person){console.log(person["name"])};printName(person);\n',
    'const person={};function printName(n){console.log(n.name)}person.name="brian",person.age=100,printName(person);',
    'property access converted to use dot notation check',
  );
  checkMinified(
    'var name = "meteor"; var website = "www.meteor.com";var memberCount = 56;\n',
    'var name="meteor",website="www.meteor.com",memberCount=56;',
    'join consecutive var variable declarations and assignments into one statement check',
  );
  checkMinified(
    'let name = "meteor"; let website = "www.meteor.com";let memberCount = 56;\n',
    'let name="meteor",website="www.meteor.com",memberCount=56;',
    'join consecutive let variable declarations and assignments into one statement check',
  );
  checkMinified(
    'const name = "meteor"; const website = "www.meteor.com";const memberCount = 56;\n',
    'const name="meteor",website="www.meteor.com",memberCount=56;',
    'join consecutive const variable declarations and assignments into one statement check',
  );
  checkMinified(
    'let foo;if (typeof foo == "undefined") { console.log("undefined variable"); }\n',
    'let foo;void 0===foo&&console.log("undefined variable");',
    'converting typeof operator into an equality with void 0 check',
  );
  checkMinified(
    'let a = 10 + 20 + 30;\n',
    'let a=60;',
    'simple math evaluation check',
  );
  checkMinified(
    'if (false) { console.log("hi"); }\n',
    '0;',
    'unreachable code elimination check',
  );
  checkMinified(
    'function a(z) { let returnValue = z == 10; return returnValue; }\n',
    'function a(n){let t;return 10==n}',
    'uneeded variable that returns a computed value being replaced with a statement that directly returns that computed value check',
  );
  checkMinified(
    'let name = "meteor"; debugger; let age = 100;\n',
    'let name="meteor";debugger;let age=100;',
    'debugger statements will be left in the source check',
  );

});


