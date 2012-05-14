Package.describe({
  summary: "Javascript template that uses HAML as markup and understands coffeescript"
});

var HamlCoffee = require('haml-coffee-meteor').Compiler;
var CoffeeScript = require('coffee-script')
var fs = require('fs');

Package.register_extension(
  "hamlc", function (bundle, source_path, serve_path, where) {
    serve_path = serve_path + '.js';

    var contents = fs.readFileSync(source_path);
    var compiler;
    var compiler = new HamlCoffee();
    var splits = source_path.split('/');
    var template_name = splits[splits.length-1];
    template_name = template_name.split('.')[0];
    compiler.parse(contents.toString('utf8'));
    contents = new Buffer("if (typeof HAML == 'undefined') {var HAML = {}}; HAML['"+template_name+"']=function(params) { return (function(){"+CoffeeScript.compile(compiler.precompile(), {bare: true})+"}).call(params) };");

    bundle.add_resource({
      type: "js",
      path: serve_path,
      data: contents,
      where: where
    });
  }
);
