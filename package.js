Package.describe({
  summary: "Allows templates to be defined in .html files",
  internal: true
});

var fs = require('fs');
var path = require('path');

Package.on_use(function (api) {
  // XXX would like to do the following only when the first html file
  // is encountered.. shouldn't be very hard, we just need a way to
  // get at 'api' from a register_extension handler

  api.use(['underscore', 'spark'], 'client');

  // provides the runtime logic to instantiate our templates
  api.add_files('deftemplate.js', 'client');

  // html_scanner.js emits client code that calls Meteor.startup
  api.use('startup', 'client');

  // for now, the only templating system we support
  // XXX this is a huge hack. using handlebars causes a Handlebars
  // symbol to be slammed into the global environment, which
  // html_scanner needs. refactor.
  api.use('handlebars', 'client');
});

Package.register_extension(
  "html", function (bundle, source_path, serve_path, where) {
    if (where !== "client")
      // XXX might be nice to throw an error here, but then we'd have
      // to make it so that packages.js ignores html files that appear
      // in the server directories in an app tree.. or, it might be
      // nice to make html files actually work on the server (against
      // jsdom or something)
      return;

    // XXX the way we deal with encodings here is sloppy .. should get
    // religion on that
    var contents = fs.readFileSync(source_path);

    var html_scanner = Package.require('html_scanner.js');
    var results = html_scanner.scan(contents.toString('utf8'), source_path);

    if (results.head)
      bundle.add_resource({
        type: "head",
        data: results.head,
        where: where
      });

    if (results.body)
      bundle.add_resource({
        type: "body",
        data: results.body,
        where: where
      });

    if (results.js) {
      var path_part = path.dirname(serve_path);
      if (path_part === '.')
        path_part = '';
      if (path_part.length && path_part !== path.sep)
        path_part = path_part + path.sep;
      var ext = path.extname(source_path);
      var basename = path.basename(serve_path, ext);
      serve_path = path_part + "template." + basename + ".js";

      bundle.add_resource({
        type: "js",
        path: serve_path,
        data: new Buffer(results.js),
        source_file: source_path,
        where: where
      });
    }
  }
);

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('htmljs');
  api.use(['test-helpers', 'domutils', 'session'], 'client');
  api.use('handlebars', 'server');
  api.add_files([
    'templating_tests.js',
    'templating_tests.html'
  ], 'client');
  api.add_files([
    'html_scanner.js',
    'scanner_tests.js'
  ], 'server');
});
