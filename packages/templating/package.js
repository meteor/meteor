Package.describe({
  summary: "Allows templates to be defined in .html files",
  environments: ["client"],
  internal: true
});

Package.depend(['underscore', 'liveui']);

// XXX super lame! we actually have to give paths relative to
// app/inner/app.js, since that's who's evaling us.
var html_scanner = require('../../packages/templating/html_scanner.js');

// XXX the way we deal with encodings here is sloppy .. should get
// religion on that

var fs = require('fs');
var path = require('path');

Package.register_extension(
  "html", function (bundle, source_path, serve_path, environment) {
    var contents = fs.readFileSync(source_path);
    var results = html_scanner.scan(contents.toString('utf8'));

    if (results.head)
      bundle.add_resource({
        type: "head",
        data: results.head,
        environments: environment
      });

    if (results.body)
      bundle.add_resource({
        type: "body",
        data: results.body,
        environments: environment
      });

    if (results.js) {
      var path_part = path.dirname(serve_path)
      if (path_part === '.')
        path_part = '';
      if (path_part.length && path_part !== '/')
        path_part = path_part + "/";
      var ext = path.extname(source_path);
      var basename = path.basename(serve_path, ext);
      serve_path = path_part + "template." + basename + ".js";

      bundle.add_resource({
        type: "js",
        path: serve_path,
        data: new Buffer(results.js),
        source_file: source_path,
        environments: environment
      });
    }
  }
);

// provides the runtime logic to instantiate our templates
Package.source('deftemplate.js');

// html_scanner.js emits client code that calls Meteor.startup
Package.depend('startup');

// for now, the only templating system we support
Package.depend('handlebars');
