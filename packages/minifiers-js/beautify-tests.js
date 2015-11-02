
// The UglifyJSMinify API can also be used for beautification.  Test that it
// behaves as expected.

Tinytest.add('minifiers - uglify beautify', function (test) {
  // See <https://github.com/mishoo/UglifyJS2#the-simple-way> and
  // <http://lisperator.net/uglifyjs/codegen> for the API we're calling.
  test.equal(UglifyJSMinify('one = function () { return 1; };',
                            { fromString: true,
                              output: { beautify: true,
                                        indent_level: 2,
                                        width: 80 } }).code,
             'one = function() {\n' +
             '  return 1;\n' +
             '};');
});
