var fs = require("fs");

exports.makeLink = function (target, linkPath) {
  fs.symlinkSync(target, linkPath, "junction");
};

exports.readLink = function (linkPath) {
  return fs.realpathSync(linkPath);
};
