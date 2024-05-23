Tinytest.add('minifier-js - verify how terser handles an empty string', (test) => {
  let result = meteorJsMinify('');
  test.equal(result.code, '');
  test.equal(result.minifier, 'terser');
});

Tinytest.add('minifier-js - verify terser is able to minify valid javascript', (test) => {
  let result = meteorJsMinify('function add(first,second){return first + second; }\n');
  test.equal(result.code, 'function add(n,d){return n+d}');
  test.equal(result.minifier, 'terser');
});

Tinytest.add('minifier-js - verify error handling is done as expected', (test) => {
  test.throws( () => meteorJsMinify('let name = {;\n'), undefined );
});

Tinytest.add('minifier-js - verify tersers error object has the fields we use for reporting errors to users', (test) => {
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
