Package.describe({
  summary: "Allows templates to be defined in .html files",
  internal: true
});

Package.require('underscore');
Package.require('liveui');

// XXX super lame! we actually have to give paths relative to
// app/inner/app.js, since that's who's evaling us.
var html_scanner = require('../../packages/templating/html_scanner.js');

// XXX the way we deal with encodings here is sloppy .. should get
// religion on that

var fs = require('fs');
var path = require('path');

Package.register_extension(
  "html", function (filename, rel_filename, is_client, is_server) {
    if (!is_client) return; // only for the client.

    var contents = fs.readFileSync(filename);
    var results = html_scanner.scan(contents.toString('utf8'));

    if (results.head)
      Package.append_head(results.head);

    if (results.body)
      Package.append_head(results.body);

    if (results.js) {
      var path_part = path.dirname(rel_filename)
      if (path_part === '.')
        path_part = '';
      if (path_part.length && path_part !== '/')
        path_part = path_part + "/";
      var ext = path.extname(filename);
      var basename = path.basename(rel_filename, ext);
      rel_filename = path_part + "template." + basename + ".js";

      Package.client_js_buffer(rel_filename, new Buffer(results.js));
    }
  });

// provides the runtime logic to instantiate our templates
Package.client_file('deftemplate.js');

// html_scanner.js emits client code that calls Sky.startup
// XXX the correct thing would be to require this only on the client
Package.require('startup');

// for now, the only templating system we support
Package.require('handlebars');
