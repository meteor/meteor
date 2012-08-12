Package.describe({
  summary: "Javascript dialect similar to coffeescript based off of coco"
});

var LiveScript = require('LiveScript');
var fs = require('fs');

Package.register_extension(
  "ls", function (bundle, source_path, serve_path, where) {
    serve_path = serve_path + '.js';

    var contents = fs.readFileSync(source_path);
    var options = {bare: true};
    contents = new Buffer(LiveScript.compile(contents.toString('utf8'), options));
    // XXX report coffee compile failures better?

    bundle.add_resource({
      type: "js",
      path: serve_path,
      data: contents,
      where: where
    });
  }
);

Package.on_test(function (api) {
  api.add_files(['livescript_tests.coffee', 'livescript_tests.js'],
                ['client', 'server']);
});
