// Source: http://code.google.com/p/google-code-prettify

// XXX this sucks. I would much rather do this processing at
// bundle-time on the server, not in the client. (though I'd like to
// support both..)

Package.describe({
  summary: "Syntax highlighting of code, from Google"
});

// XXX this code dumps symbols into the global namespace (directly
// onto 'window'.) we need to fix that.
Package.client_file('prettify.js');
Package.client_css_file('prettify.css');
Package.client_css_file('styles/sunburst.css');
