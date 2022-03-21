Tinytest.add('minifier-js - verify how swc handles an empty string', (test) => {
  let result = meteorJsMinify('');
  test.equal(result.code, '');
  test.equal(result.minifier, 'swc');
});

Tinytest.add('minifier-js - verify swc is able to minify valid javascript', (test) => {
  let result = meteorJsMinify('function add(first,second){return first + second; }\n');
  test.equal(result.code, 'function add(a,b){return a+b}');
  test.equal(result.minifier, 'swc');
});

Tinytest.add('minifier-js - verify error handling is done as expected', (test) => {
  test.throws( () => meteorJsMinify('let name = {;\n'), undefined );
});

Tinytest.add('minifier-js - verify swc error object has the fields we use for reporting errors to users', (test) => {
  let result;
  try {
    result = meteorJsMinify('let name = {;\n');
  }
  catch (err) {
    test.isNotUndefined(err.name);
    test.isNotUndefined(err.message);
    test.isNotUndefined(err.filename);
    test.isNotUndefined(err.line);
    test.isNotUndefined(err.col);
  }
});
