Package.describe({
  summary: "The dynamic stylesheet language."
});

var less = require('less');
var fs = require('fs');
var path = require('path');
var temp = [];
Array.prototype.contains = function(obj) {
    var i = this.length;
    while (i--) {
        if (this[i] === obj) {
            return true;
        }
    }
    return false;
}
Package.register_extension(
  "less", function (bundle, source_path, serve_path, where) {
    serve_path = serve_path + '.css';
    if(!temp.contains(source_path)){
      var contents = String(fs.readFileSync(source_path));
      var myRegexp = /@import "([\w'-/.]*)";/g;
      var match = myRegexp.exec(contents);
      while (match != null) {
          var pat = path.join(path.dirname(source_path),match[1]);
          mixin = String(fs.readFileSync(pat));
          contents = contents.replace(match[0], mixin);
          match = myRegexp.exec(contents);
          temp.push(pat);
      }
      try {
        less.render(contents.toString('utf8'), function (err, css) {
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
        //bundle.error(source_path + ": Less compiler error: " + e.message);
      }
    }
  }
);

Package.on_test(function (api) {
  api.add_files(['less_tests.less', 'less_tests.js'], 'client');
});
