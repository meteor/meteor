var fs = require('fs');
var path = require('path');
var _ = require('underscore');
var files = require('./files.js');

var project = exports;
_.extend(exports, {

  _get_lines: function (file) {
    var raw = fs.readFileSync(file, 'utf8');
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

  _get_packages_lines: function (app_dir) {
    return project._get_lines(path.join(app_dir, '.meteor', 'packages'));
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

  // Package names used by this project.
  get_packages: function (app_dir) {
    var ret = [];

    // read from .meteor/packages
    _.each(project._get_packages_lines(app_dir), function (line) {
      line = project._trim_line(line);
      if (line !== '')
        ret.push(line);
    });

    // add packages in the app's packages/ directory
    var appPackagesDir = path.join(app_dir, 'packages');
    if (fs.existsSync(appPackagesDir)) {
      _.each(fs.readdirSync(appPackagesDir), function(appPackage) {
        if (files.is_package_dir(path.join(appPackagesDir, appPackage)))
          ret.push(appPackage);
      });
    }

    return ret;
  },

  _meteorReleaseFilePath: function (appDir) {
    return path.join(appDir, '.meteor', 'release');
  },

  getMeteorReleaseVersion: function (appDir) {
    var releasePath = project._meteorReleaseFilePath(appDir);
    try {
      var lines = project._get_lines(releasePath);
    } catch (e) {
      // This is a legacy app with no '.meteor/release'
      // file.
      return null;
    }
    return project._trim_line(lines[0]);
  },

  writeMeteorReleaseVersion: function (appDir, release) {
    var releasePath = project._meteorReleaseFilePath(appDir);
    fs.writeFileSync(releasePath, release + '\n');
  },

  add_package: function (app_dir, name) {
    var lines = project._get_packages_lines(app_dir);

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
    var lines = _.reject(project._get_packages_lines(app_dir), function (line) {
      return project._trim_line(line) === name;
    });
    project._write_packages(app_dir, lines);
  }

});
