
Tinytest.add('minifier-js - verify simple JS minifications work', (test) => {
  let result = meteorJsMinify('function add(first,second){return first + second; }\n');
  test.equal(result.code, 'function add(n,d){return n+d}');

  result = meteorJsMinify('let foo;if (typeof foo == "undefined") { console.log("undefined variable"); }\n');
  test.equal(result.code, 'let foo;void 0===foo&&console.log("undefined variable");');

  result = meteorJsMinify('function a(z) { let returnValue = z == 10; return returnValue; }\n');
  test.equal(result.code,'function a(n){let t;return 10==n}');
});

// properties -- default(true)
Tinytest.add('minifier-js - verify properties setting', (test) => {
  let result = meteorJsMinify('const person = {};person["name"] = "brian";person["age"] = 100; function printName(person){console.log(person["name"])};printName(person);\n');
  test.equal(result.code, 'const person={};function printName(n){console.log(n.name)}person.name="brian",person.age=100,printName(person);');
});

// evaluate -- default(true)
Tinytest.add('minifier-js - verify evaluate setting', (test) => {
  let result = meteorJsMinify('let a = 10 + 20 + 30;\n');
  test.equal(result.code, 'let a=60;');
});

// keep_infinity -- default(false)
Tinytest.add('minifier-js - verify keep_infinity setting', (test) => {
  let result = meteorJsMinify('let a = Infinity;\n');
  test.equal(result.code, 'let a=1/0;');
});

// sequences -- default(true)
Tinytest.add('minifier-js - verify sequences setting', (test) => {
  let result = meteorJsMinify('var name = "meteor"; var website = "www.meteor.com";var memberCount = 56;\n');
  test.equal(result.code, 'var name="meteor",website="www.meteor.com",memberCount=56;');

  result = meteorJsMinify('let name = "meteor"; let website = "www.meteor.com";let memberCount = 56;\n');
  test.equal(result.code, 'let name="meteor",website="www.meteor.com",memberCount=56;');

  result = meteorJsMinify('const name = "meteor"; const website = "www.meteor.com";const memberCount = 56;\n');
  test.equal(result.code, 'const name="meteor",website="www.meteor.com",memberCount=56;');
});

// dead_code -- default(true)
Tinytest.add('minifier-js - verify dead_code setting', (test) => {
   
  let result = meteorJsMinify('function f() {a();b();x = 10;return;if (x) {y();}}\n');
  test.equal(result.code, 'function f(){a(),b(),x=10}');

  result = meteorJsMinify('if (false) { console.log("hi"); }\n');
  test.equal(result.code,'0;');
});

//keep_numbers -- default(false)
Tinytest.add('minifier-js - verify keep_numbers setting', (test) => {   
  let result = meteorJsMinify('let number = 1_000_000_000_000;\n');
  test.equal(result.code, 'let number=1e12;');
  
  result = meteorJsMinify('let number = 0.000_000_000_001;\n');
  test.equal(result.code,'let number=1e-12;');
});


// unused -- default(true)
Tinytest.add('minifier-js - verify unused setting', (test) => {
  let result = meteorJsMinify('function foo(){let name = "ron";let firstName = "roger";console.log(firstName)};function bar(){let name = "ron";let firstName = "roger";console.log(firstName)};foo()\n');
  test.equal(result.code, 'function foo(){let o="ron",r="roger";console.log("roger")}function bar(){let o="ron",r="roger";console.log("roger")}foo();');
});

// drop_debugger -- default(true)
Tinytest.add('minifier-js - verify drop_debugger setting', (test) => {
  let result = meteorJsMinify('let name = "meteor"; debugger; let age = 100;\n');
  test.equal(result.code, 'let name="meteor";debugger;let age=100;');

  result = meteorJsMinify('let name = "meteor";debugger;let age = 100;function printStatement(name) { console.log("hello QA developers " + name); debugger; };printStatement("brian");\n');
  test.equal(result.code, 'let name="meteor";debugger;let age=100;function printStatement(e){console.log("hello QA developers "+e);debugger}printStatement("brian");');
});