var _ = require('./third/underscore.js');
var files = require('./files.js');
var fs = require('fs');
var path = require('path');

var packages = module.exports = {
  // get the description info out of a package
  describe: function (name) {
    // XXX this is a huge nasty hack. this whole thing will need to be
    // rethought going forward
    var Package = {};
    _.each(['require', 'client_file', 'register_extension',
            'server_js_buffer', 'client_js_buffer', 'client_css_buffer',
            'client_css_file', 'append_head', 'append_body', 'server_file'],
           function (f) {
             Package[f] = function () {};
           });
    var ret = {};
    Package.describe = function (x) {
      _.extend(ret, x);
    };
    ret.name = name;
    var fullpath = path.join(files.get_package_dir(), name, 'package.js');
    var init = fs.readFileSync(fullpath).toString();
    (function () { eval(init); })();
    return ret;
  },

  // get all packages, in a map from package name to description
  // info. description info will also contain a key 'name' which is
  // the package name.
  list: function () {
    var ret = {};
    var dir = files.get_package_dir();
    _.each(fs.readdirSync(dir), function (pkg) {
      ret[pkg] = packages.describe(pkg);
    });

    return ret;
  },

  // returns a pretty list suitable for showing to the user. input is
  // a list of descriptions as returned by describe().
  format_list: function (descrs) {
    var longest = '';
    _.each(descrs, function (d) {
      if (d.name.length > longest.length)
        longest = d.name;
    });
    var pad = longest.replace(/./g, ' ');
    // it'd be nice to read the actual terminal width, but I tried
    // several methods and none of them work (COLUMNS isn't set in
    // node's environment; `tput cols` returns a constant 80.) maybe
    // node is doing something weird with ptys.
    var width = 80;

    var out = '';
    _.each(descrs, function (d) {
      if (d.internal)
        return;
      var name = d.name + pad.substr(d.name.length);
      var summary = d.summary || 'No description';
      out += (name + "  " +
              summary.substr(0, width - 2 - pad.length) + "\n");
    });

    return out;
  }
}
