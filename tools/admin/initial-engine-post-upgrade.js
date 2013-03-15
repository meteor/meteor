var fs = require('fs');
var path = require('path');
var kexec = require('kexec');
var Future = require('fibers/future');
var shell_quote = require('shell-quote');
var _ = require('underscore');


var prefix = path.join(__dirname, '..', '..', '..');
var binary = path.join(prefix, 'bin', 'meteor');
var oldDirectory = path.join(prefix, 'meteor');
var bootstrapScript = path.join(
  oldDirectory, 'app', 'meteor', 'meteor-bootstrap.sh');

// Figure out what platform we're upgrading on (dpkg, rpm, tar)
var package_stamp_path = path.join(oldDirectory, '.package_stamp');
var package_stamp;
try {
  package_stamp = fs.readFileSync(package_stamp_path, 'utf8');
  package_stamp = package_stamp.replace(/^\s+|\s+$/g, '');
} catch (err) {
  // no package stamp, assume tarball.
  package_stamp = 'tar';
}


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

var macUpgrade = function () {
  fs.unlinkSync(binary);
  fs.writeFileSync(binary, fs.readFileSync(bootstrapScript));
  fs.chmodSync(binary, 0755);
  rm_recursive(oldDirectory);
};

var linuxError = function () {
  console.log("Update failed. To continue this update, uninstall meteor with: ");
  if (package_stamp === "deb")
    console.log("$ sudo apt-get remove meteor");
  else
    console.log("$ sudo rpm -e meteor");
  console.log("and reinstall with: ");
  console.log("$ curl https://install.meteor.com/ | sh");
  process.exit(1);
};

var runWithRoot = function (cmd, args) {
  var spawn = require('child_process').spawn;
  var p;
  if (0 === process.getuid()) {
    // already root. just spawn the command.
    p = spawn(cmd, args);
  } else if (fs.existsSync("/bin/sudo") ||
             fs.existsSync("/usr/bin/sudo")) {
    console.log("sudo", cmd, args.join(" "));
    p = spawn('sudo', [cmd].concat(args));
  } else {
    console.log("Meteor expected to be run as root or have access to sudo.");
    linuxError();  // exits
  }

  var f = new Future;
  p.on('exit', function (code, signal) {
    if (code !== 0 || signal) {
      console.log("Error: failed to run " + cmd + ".");
      linuxError();  // exits
    }
    f.return();
  });
  f.wait();
};

var copyScriptLinux = function () {
  runWithRoot("cp", [bootstrapScript, binary]);
  fs.chmodSync(binary, 0755);
};

var debUpgrade = function () {
  copyScriptLinux();
  runWithRoot("dpkg", ["-r", "meteor"]);
};

var rpmUpgrade = function () {
  copyScriptLinux();
  runWithRoot("rpm", ["-e", "meteor"]);
};

Fiber(function () {
  console.log("Upgrading to Engine Meteor in " + prefix + "!");
  if (package_stamp === 'tar') {
    macUpgrade();
  } else if (package_stamp === 'deb') {
    debUpgrade();
  } else if (package_stamp === 'rpm') {
    rpmUpgrade();
  }

  kexec(shell_quote.quote([binary, 'update']));
}).run();
