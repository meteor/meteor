Package.describe({
  summary: "The dynamic stylesheet language."
});

var less = require('less');
var fs = require('fs');

Package.register_extension(
  "less", function (bundle, source_path, serve_path, where) {
    serve_path = serve_path + '.css';

    var contents = fs.readFileSync(source_path);

    try {
      less.render(contents.toString('utf8'), function (err, css) {
        // XXX why is this a callback? it's not async.
        if (err) {
          bundle.error(source_path + ": Less compiler error: " + err.message);
          return;
        }

        bundle.add_resource({
          type: "css",
          path: serve_path,
          data: new Buffer(css),
          where: where
        });
      });
    } catch (e) {
      // less.render() is supposed to report any errors via its
      // callback. But sometimes, it throws them instead. This is
      // probably a bug in less. Be prepared for either behavior.
      bundle.error(source_path + ": Less compiler error: " + e.message);
    }
  }
);

Package.on_test(function (api) {
  api.add_files(['less_tests.less', 'less_tests.js'], 'client');
});
