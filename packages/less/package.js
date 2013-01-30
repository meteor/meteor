Package.describe({
  summary: "The dynamic stylesheet language."
});

var less = require('less');
var fs = require('fs');
var path = require('path');
var Future = require(path.join('fibers', 'future'));

Package.register_extension(
  "less", function (bundle, source_path, serve_path, where) {
    serve_path = serve_path + '.css';

    var contents = fs.readFileSync(source_path, 'utf8');

    try {
      var css = Future.wrap(less.render)(contents, {
        paths: [path.resolve(source_path, '..')] // for @import
      }).wait();
      bundle.add_resource({
        type: "css",
        path: serve_path,
        data: new Buffer(css),
        where: where
      });
    } catch (e) {
      bundle.error(source_path + ": Less compiler error: " + e.message);
    }
  }
);

Package.on_test(function (api) {
  api.use('test-helpers');
  api.add_files(['less_tests.less', 'less_tests.js'], 'client');
});
