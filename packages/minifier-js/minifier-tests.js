Tinytest.addAsync('minifier-js - verify how terser handles an empty string', async (test) => {
  let result = await meteorJsMinify('');
  test.equal(result.code, '');
  test.equal(result.minifier, 'terser');
});

Tinytest.addAsync('minifier-js - verify terser is able to minify valid javascript', async (test) => {
  let result = await meteorJsMinify('function add(first,second){return first + second; }\n');
  test.equal(result.code, 'function add(n,d){return n+d}');
  test.equal(result.minifier, 'terser');
});

Tinytest.addAsync('minifier-js - verify error handling is done as expected', async (test) => {
  await test.throwsAsync( async () => await meteorJsMinify('let name = {;\n'), undefined );
});

Tinytest.addAsync('minifier-js - verify tersers error object has the fields we use for reporting errors to users', async (test) => {
  try {
    await meteorJsMinify('let name = {;\n');
  }
  catch (err) {
    test.isNotUndefined(err.name);
    test.isNotUndefined(err.message);
    test.isNotUndefined(err.filename);
    test.isNotUndefined(err.line);
    test.isNotUndefined(err.col);
  }
});
