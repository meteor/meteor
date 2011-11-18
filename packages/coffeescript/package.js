Package.describe({
  summary: "Javascript dialect with fewer braces and semicolons"
});

var coffee = require('coffee-script');
var fs = require('fs');

Package.register_extension(
  "coffee", function (filename, rel_filename, is_client, is_server) {
    rel_filename = rel_filename + '.js';

    var contents = fs.readFileSync(filename);
    contents = new Buffer(coffee.compile(contents.toString('utf8')));
    // XXX report coffee compile failures better?

    if (is_client)
      Package.client_js_buffer(rel_filename, contents);
    if (is_server)
      Package.server_js_buffer(rel_filename, contents);
});
