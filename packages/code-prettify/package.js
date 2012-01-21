// Source: http://code.google.com/p/google-code-prettify

// XXX this sucks. I would much rather do this processing at
// bundle-time on the server, not in the client. (though I'd like to
// support both..)

Package.describe({
  summary: "Syntax highlighting of code, from Google",
  environments: ["client"]
});

// XXX this code dumps symbols into the global namespace (directly
// onto 'window'.) we need to fix that.
Package.source(['prettify.js',
                'prettify.css',
                'styles/sunburst.css']);
