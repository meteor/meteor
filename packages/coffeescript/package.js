Package.describe({
  summary: "Javascript dialect with fewer braces and semicolons"
});

var coffee = require('coffee-script');
var fs = require('fs');
var path = require('path');

var coffeescript_handler = function(bundle, source_path, serve_path, where, literate) {
  serve_path = serve_path + '.js';

  var contents = fs.readFileSync(source_path);
  var options = {
    bare: true,
    map: true,
    filename: source_path,
    literate: literate
  };
  
  try {
    contents = coffee.compile(contents.toString('utf8'), options);
  } catch (e) {
    return bundle.error(e.message);
  }

  contents = new Buffer(contents);
  bundle.add_resource({
    type: "js",
    path: serve_path,
    data: contents,
    where: where
  });
}

var coffeescript_default_handler = function(bundle, source_path, serve_path, where) {
  return coffeescript_handler(bundle, source_path, serve_path, where, false);
}

var coffeescript_literate_handler = function(bundle, source_path, serve_path, where) {
  return coffeescript_handler(bundle, source_path, serve_path, where, true);
}

Package.register_extension("coffee", coffeescript_default_handler);
Package.register_extension("litcoffee", coffeescript_literate_handler);
Package.register_extension("coffee.md", coffeescript_literate_handler);

Package.on_test(function (api) {
  api.add_files(['coffeescript_tests.coffee', 'litcoffeescript_tests.litcoffee', 'litcoffeescript_tests.coffee.md', 'coffeescript_tests.js'],
                ['client', 'server']);
});
