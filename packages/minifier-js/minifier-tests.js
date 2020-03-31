// this test case verifies that terser can minify code we give it
Tinytest.add('minifier-js - verify simple JS minifications work', (test) => {

  let terserResult = meteorJsMinify('function add(first,second){return first + second; }\n');
  test.equal(terserResult.code, 'function add(n,d){return n+d}');
  test.equal(terserResult.minifier, 'terser');
  
});


// this test case verifies that when terser can't handle something, babel-minify will step in as a fallback
Tinytest.add('minifier-js - syntax terser cannot handle is handled correctly by babel-minify', (test) => {
  
  let babelResult = meteorJsMinify('let number = 1_000_000_000_000;\n');
  test.equal(babelResult.code, 'let number=1e12;');
  test.equal(babelResult.minifier, 'babel-minify');
  
});

// This test case verifies the behavior when both terser and babel-minfiy fail
Tinytest.add('minifier-js - errors are handled correctly', (test) => {

  test.throws(() => meteorJsMinify('let name = {;\n'));    

});
