Package.describe({
  summary: "The dynamic stylesheet language."
});

var less = require('less')
var fs = require('fs');

Package.register_extension(
  "less", function (filename, rel_filename, is_client, is_server) {
    if (!is_client) return; // only for the client.

    rel_filename = rel_filename + '.css';

    var contents = fs.readFileSync(filename);
    less.render(contents.toString('utf8'), function (err, css) {
      // XXX why is this a callback? it's not async.

      // XXX report compile failures better?
      if (err) throw new Error(err);

      contents = new Buffer(css);

      Package.client_css_buffer(rel_filename, contents);
    });
  });
