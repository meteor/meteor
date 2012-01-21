Package.describe({
  summary: "The dynamic stylesheet language."
});

var less = require('less')
var fs = require('fs');

Package.register_extension(
  "less", function (bundle, source_path, serve_path, environment) {
    serve_path = serve_path + '.css';

    var contents = fs.readFileSync(source_path);
    less.render(contents.toString('utf8'), function (err, css) {
      // XXX why is this a callback? it's not async.
      // XXX report compile failures better?
      if (err) throw new Error(err);

      bundle.add_resource({
        type: "css",
        path: serve_path,
        data: new Buffer(css),
        environments: environment
      });
    });
  }
);
