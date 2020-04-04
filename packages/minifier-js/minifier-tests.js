Tinytest.add('minifier-js - verify terser is able to minify files', (test) => {
  let terserResult = meteorJsMinify('function add(first,second){return first + second; }\n');
  test.equal(terserResult.code, 'function add(n,d){return n+d}');  
});

// this feature has been reqested in this issue https://github.com/terser/terser/issues/632
// so when we bump up the terser version in the future and this test fails we will know when
// its been done and can remove this test :)
Tinytest.add('minifier-js - unsupported feature test (numeric seperators)', (test) => {
  test.throws(() => meteorJsMinify('let number = 1_000_000_000_000;\n')  );   
});

Tinytest.add('minifier-js - verify error handling is done correctly', (test) => {
  test.throws(() => meteorJsMinify('let name = {;\n'));    
});
