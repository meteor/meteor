// Source: http://code.google.com/p/google-code-prettify

// XXX this sucks. I would much rather do this processing at
// bundle-time on the server, not in the client. (though I'd like to
// support both..)

var path = Npm.require('path');

Package.describe({
  summary: "Syntax highlighting of code, from Google",
  version: "1.0.3"
});

// XXX this code dumps symbols into the global namespace (directly
// onto 'window'.) we need to fix that.
Package.onUse(function (api) {
  api.addFiles([
    'prettify.js',
    'prettify.css',
    path.join('styles', 'sunburst.css')], "client");
});
