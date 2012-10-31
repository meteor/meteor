var fs = require('fs');
var path = require('path');
var _ = require(path.join(__dirname, 'third', 'underscore.js'));

var project = module.exports = {

  _get_lines: function (app_dir) {
    var raw = fs.readFileSync(path.join(app_dir, '.meteor', 'packages'), 'utf8');
    var lines = raw.split(/\r*\n\r*/);

    // strip blank lines at the end
    while (lines.length) {
      var line = lines[lines.length - 1];
      if (line.match(/\S/))
        break;
      lines.pop();
    }

    return lines;
  },

  _trim_line: function (line) {
    var match = line.match(/^([^#]*)#/);
    if (match)
      line = match[1];
    line = line.replace(/^\s+|\s+$/g, ''); // leading/trailing whitespace
    return line;
  },

  _write_packages: function (app_dir, lines) {
    fs.writeFileSync(path.join(app_dir, '.meteor', 'packages'),
                     lines.join('\n') + '\n', 'utf8');
  },

  // Packages used by this project.
  get_packages: function (app_dir) {
    var ret = [];

    _.each(project._get_lines(app_dir), function (line) {
      line = project._trim_line(line);
      if (line !== '')
        ret.push(line);
    });

    return ret;
  },

  add_package: function (app_dir, name) {
    var lines = project._get_lines(app_dir);

    // detail: if the file starts with a comment, try to keep a single
    // blank line after the comment (unless the user removes it)
    var current = project.get_packages(app_dir);
    if (!current.length && lines.length)
      lines.push('');
    lines.push(name);
    project._write_packages(app_dir, lines);
  },

  remove_package: function (app_dir, name) {
    // XXX assume no special regexp characters
    var lines = _.reject(project._get_lines(app_dir), function (line) {
      return project._trim_line(line) === name;
    });
    project._write_packages(app_dir, lines);
  }

};
