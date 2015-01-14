// run as node scripts/admin/bump-all-version-numbers.js <packageNames>

var fs = require("fs");
var _ = require("../../packages/underscore/underscore.js")._;

var packageNames = _.rest(process.argv, 2);

_.each(packageNames, function (name) {
  // name = "packages/" + name + "/package.js";

  var content = fs.readFileSync(name, {encoding: "utf-8"});

  match = content.match(/\d+\.\d+\.\d+-winr\.\d+/);
  if (match) {
    var versionNumber = match[0];
    var s = versionNumber.split(".");
    s[2] = parseInt(s[2].split("-")[0], 10);
    s = s.slice(0, 3);
    var incremented = s.join(".") + "-winr.1";

    content = content.replace(versionNumber, incremented);
    //console.log(incremented);
    fs.writeFileSync(name, content);
  }
});
