Package.describe({
  summary: "Javascript dialect with fewer braces and semicolons"
});

Npm.depends({"coffee-script": "1.6.2"});

var coffeescript_handler = function(bundle, source_path, serve_path, where, literate) {
  var fs = Npm.require('fs');
  var path = Npm.require('path');
  var coffee = Npm.require('coffee-script');
  serve_path = serve_path + '.js';

  var contents = fs.readFileSync(source_path);
  var options = {
    bare: true, 
    filename: source_path, 
    literate: literate
  };
  try {
    contents = coffee.compile(contents.toString('utf8'), options);
  } catch (e) {
    return bundle.error(
      source_path + ':' +
      (e.location ? (e.location.first_line + ': ') : ' ') +
      e.message
    );
  }

  contents = new Buffer(contents);
  bundle.add_resource({
    type: "js",
    path: serve_path,
    data: contents,
    where: where
  });
}

var coffeescript_handler_literate = function(bundle, source_path, serve_path, where) {
  coffeescript_handler(bundle, source_path, serve_path, where, true);
}

var coffeescript_handler_no_literate = function(bundle, source_path, serve_path, where) {
  coffeescript_handler(bundle, source_path, serve_path, where, false);
}

Package.register_extension("coffee", coffeescript_handler_no_literate);
Package.register_extension("litcoffee", coffeescript_handler_literate);
Package.register_extension("coffee.md", coffeescript_handler_literate);

Package.on_test(function (api) {
  api.add_files([
    'coffeescript_tests.coffee',
    'coffeescript_strict_tests.coffee',
    'litcoffeescript_tests.litcoffee',
    'coffeescript_tests.js'
  ], ['client', 'server']);
});
