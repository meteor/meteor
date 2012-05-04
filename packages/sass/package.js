Package.describe({
  summary: "Sassy CSS pre-processor."
});

var sass = require('sass');
var fs = require('fs');

Package.register_extension(
  "sass", function (bundle, source_path, serve_path, where) {
    serve_path = serve_path + '.css';

    try {
      var contents = fs.readFileSync(source_path);
      var css = sass.render(contents.toString('utf8'));
      // NOTE: sass does not seem to return any sort of error. It just
      // silently ignores bad sass code.

      bundle.add_resource({
        type: "css",
        path: serve_path,
        data: new Buffer(css),
        where: where
      });
    } catch (e) {
      // Haven't been able to get sass to throw, but just in case.
      bundle.error(source_path + ": Sass compiler error: " + e.message);
    }
  }
);

Package.on_test(function (api) {
  api.add_files(['sass_tests.sass', 'sass_tests.js'], 'client');
});
