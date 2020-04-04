Tinytest.add('minifier-js - verify simple JS minifications work', (test) => {
  let terserResult = meteorJsMinify('function add(first,second){return first + second; }\n');
  test.equal(terserResult.code, 'function add(n,d){return n+d}');  
});

// this feature has been reqested in this issue https://github.com/terser/terser/issues/632
// so when we bump the version and this fails we will know when :)
Tinytest.add('minifier-js - numeric seperator test', (test) => {
  test.throws(() => meteorJsMinify('let number = 1_000_000_000_000;\n')  );   
});

Tinytest.add('minifier-js - verify error handling is done correctly', (test) => {
  test.throws(() => meteorJsMinify('let name = {;\n'));    
});
