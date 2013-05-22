Package.describe({
  summary: "Sassy SCSS to CSS pre-processor."
});

Npm.depends( {"node-sass" : "0.5.0"} );

Package.register_extension(
  "sass", function (bundle, source_path, serve_path, where) {
    var sass = Npm.require('node-sass');
    var fs = Npm.require('fs');

    serve_path = serve_path + '.css';

    try {
      var contents = fs.readFileSync(source_path);
      var css = sass.renderSync({ data: contents.toString('utf8') });

      bundle.add_resource({
        type: "css",
        path: serve_path,
        data: new Buffer(css),
        where: where
      });

    } catch (e) {
      bundle.error(source_path + ": Sass compiler error: " + e.message);
    }
  }
);

Package.on_test(function (api) {
  api.add_files(['sass_tests.sass', 'sass_tests.js'], 'client');
  api.use('test-helpers', 'client');
});
