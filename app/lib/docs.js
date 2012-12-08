var path = require('path');
var packages = require(path.join(__dirname, 'packages.js'));
var _ = require(path.join(__dirname, 'third', 'underscore.js'));
var fs = require('fs');

// XXX this is a hack to call the jsparse package from the bundler
// put `ParseNode`, `Parser`, and `Parsers` in the global namespace
require(path.join(__dirname, '..', '..', 'packages',
                  'jsparse', 'parserlib'));
// put `JSLexer` in the global namespace
require(path.join(__dirname, '..', '..', 'packages',
                  'jsparse', 'lexer'));
// put `JSParser` in the global namespace
require(path.join(__dirname, '..', '..', 'packages',
                  'jsparse', 'parser'));


exports.getAPIDocs = function () {
  var pkgs = packages.list();
  _.each(pkgs, function (pkg, name) {
    console.log("### " + name);
    if (pkg.on_use_handler) {
      pkg.on_use_handler({
        use: function () {},
        add_files: function (paths, where) {
          paths = paths ? (paths instanceof Array ? paths : [paths]) : [];
          where = where ? (where instanceof Array ? where : [where]) : [];
          _.each(paths, function (relPath) {
            if (/\.js$/.test(relPath)) {
              var fullPath = path.join(pkg.source_root, relPath);
              var source = fs.readFileSync(fullPath).toString();

              var parser = new JSParser(source, {includeComments: true});
              var parseResult;
              try {
                var tree = parser.getSyntaxTree();
                parseResult = "parse success";
              } catch (parseError) {
                parseResult = "PARSE ERROR: " + parseError.message;
              }
              console.log(" * " + relPath + ": " + parseResult);
            }
          });
        },
        ////// (other methods are not called by any packages...)
        registered_extensions: function () { return []; },
        include_tests: function () {},
        error: function () {}
      });
    }
  });

  return "foo";

};