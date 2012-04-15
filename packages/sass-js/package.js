Package.describe({
  summary: "JavaScript implementation of Sass"
});

var sass = require('sass');
var fs = require('fs');

Package.register_extension(
  "sass", function (bundle, source_path, serve_path, where) {
    serve_path = serve_path + '.css';

    var contents = fs.readFileSync(source_path);
    contents = new Buffer(sass.render(contents.toString('utf8')));

    bundle.add_resource({
      type: "css",
      path: serve_path,
      data: contents,
      where: where
    });
  }
);
