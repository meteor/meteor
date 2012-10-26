Package.describe({
  summary: "The dynamic stylesheet language."
});

var less = require('less');
var fs = require('fs');

Package.register_extension(
  "less", function (bundle, source_path, serve_path, where) {
    serve_path = serve_path + '.css';

    var contents = fs.readFileSync(source_path);

    /* Meteor is currently unable to compile bootstrap (or other
     * any other .less "library" wich deals with imports).
     * That's because it just tries to compile every single .less file
     * as a separate css.
     * This temporary fix is designed to check whether the first 9 chars
     * in a less file are "!!lessc!!" and, if so, compile the files.
     * If the file does not contain the pattern it is ignored.
     * A better way to do this would be to add to register_extension the
     * ability to check for a .<extension_name>_ignore file in the root
     * of the meteor project and not compile the files into them (much
     * like git's .gitignore).
     */
    var to_compile = contents.toString('utf8').substr(0,9) === "!!lessc!!";

    if(!to_compile){
      return;
    }

    try {
      less.render(contents.toString('utf8').substr(9), function (err, css) {
        // XXX why is this a callback? it's not async.
        if (err) {
          bundle.error(source_path + ": Less compiler error: " + err.message);
          return;
        }

        bundle.add_resource({
          type: "css",
          path: serve_path,
          data: new Buffer(css),
          where: where
        });
      });
    } catch (e) {
      // less.render() is supposed to report any errors via its
      // callback. But sometimes, it throws them instead. This is
      // probably a bug in less. Be prepared for either behavior.
      bundle.error(source_path + ": Less compiler error: " + e.message);
    }
  }
);

Package.on_test(function (api) {
  api.add_files(['less_tests.less', 'less_tests.js'], 'client');
});
