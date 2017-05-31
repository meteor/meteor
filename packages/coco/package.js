Package.describe({
  summary: "Coffeescript dialect with fewer WTFs"
});

var coco = require('coco');
var fs = require('fs');

Package.register_extension(
  "co", function (bundle, source_path, serve_path, where) {
    serve_path = serve_path + '.js';

    var contents = fs.readFileSync(source_path);
    contents = new Buffer(coco.compile(contents.toString('utf8')));
    // XXX report coffee compile failures better?

    bundle.add_resource({
      type: "js",
      path: serve_path,
      data: contents,
      where: where
    });
  }
);
