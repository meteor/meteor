var fs = require('fs');
var path = require('path');
var kexec = require('kexec');
var _ = require('underscore');

// Like rm -r.
var rm_recursive = function (p) {
  try {
    // the l in lstat is critical -- we want to remove symbolic
    // links, not what they point to
    var stat = fs.lstatSync(p);
  } catch (e) {
    if (e.code == "ENOENT")
      return;
    throw e;
  }

  if (stat.isDirectory()) {
    _.each(fs.readdirSync(p), function (file) {
      file = path.join(p, file);
      rm_recursive(file);
    });
    fs.rmdirSync(p);
  } else
    fs.unlinkSync(p);
};

var prefix = path.join(__dirname, '..', '..', '..');
var binary = path.join(prefix, 'bin', 'meteor');
var oldDirectory = path.join(prefix, 'meteor');
var bootstrapScript = path.join(
  oldDirectory, 'app', 'meteor', 'meteor-bootstrap.sh');

console.log("Upgrading to Engine Meteor in " + prefix + "!");
fs.unlinkSync(binary);
fs.writeFileSync(binary, fs.readFileSync(bootstrapScript));
fs.chmodSync(binary, 0755);
rm_recursive(oldDirectory);

// XXX do we really want to do this? and does this screw up if prefix contains a
// space (yes).
kexec(binary + " update");
