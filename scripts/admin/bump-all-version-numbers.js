var fs = require("fs");
var _ = require("../../packages/underscore/underscore.js")._;

var filenames = _.rest(process.argv, 2);

_.each(filenames, function (name) {
  var content = fs.readFileSync(name, {encoding: "utf-8"});

  match = content.match(/\d+\.\d+\.\d+/);
  if (match) {
    var versionNumber = match[0];
    var s = versionNumber.split(".");
    s[2] = (parseInt(s[2], 10) + 1) + "";
    var incremented = s.join(".") + "-pre.0";

    content = content.replace(versionNumber, incremented);

    fs.writeFileSync(name, content);
  }
});
