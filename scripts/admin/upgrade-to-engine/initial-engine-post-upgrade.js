var fs = require('fs');
var path = require('path');
var kexec = require('kexec');
var Fiber = require('fibers');
var Future = require('fibers/future');
var shell_quote = require('shell-quote');
var _ = require('underscore');


var prefix = path.join(__dirname, '..', '..', '..');
var oldDirectory = path.join(prefix, 'meteor');
var evenOlderDirectory = path.join(prefix, 'meteor.old');
var oldMacBinary = '/usr/local/bin/meteor';
var upgradeScript = path.join(
  oldDirectory, 'app', 'meteor', 'upgrade-to-engine.sh');
var upgradeScriptInTmp = '/tmp/upgrade-to-engine.sh.' + (Math.random() * 0x100000000 + 1).toString(36);


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

var macUninstall = function () {
  fs.unlinkSync(oldMacBinary);
  rm_recursive(oldDirectory);
  // Also remove the /usr/local/meteor.old directory that contains the
  // pre-Engine install (as opposed to /usr/local/meteor, which contains the
  // fake release).
  rm_recursive(evenOlderDirectory);
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

var debUninstall = function () {
  runWithRoot("dpkg", ["-r", "meteor"]);
};

var rpmUninstall = function () {
  runWithRoot("rpm", ["-e", "meteor"]);
};

var copyScriptToTmp = function () {
  fs.writeFileSync(upgradeScriptInTmp, fs.readFileSync(upgradeScript));
};

Fiber(function () {
  console.warn(
    "\n" +
      "Welcome back to Meteor!\n" +
      "\n" +
      "It looks like you haven't used Meteor since at least April 2013, when\n" +
      "we changed how Meteor releases are distributed. We're going to try\n" +
      "to uninstall your old version and install the latest version.\n" +
      "\n" +
      "If for some reason this doesn't work, you can just do a clean install\n" +
      "by running the following command:\n" +
      "\n" +
      "  $ curl https://install.meteor.com/ | sh\n" +
      "\n");

  if (package_stamp !== 'tar') {
    console.warn(
      "After installing the new version, if you try to run meteor within\n" +
        "your current shell, you may get an error like:\n" +
        "\n" +
        "   /usr/bin/meteor: No such file or directory\n" +
        "\n" +
        "If so, just run the command:\n" +
        "\n" +
        "  $ hash -r\n" +
        "\n" +
        "or start a new shell.\n" +
        "\n");
  }

  console.warn("Removing your current installation.\n");

  copyScriptToTmp();

  if (package_stamp === 'tar') {
    macUninstall();
  } else if (package_stamp === 'deb') {
    debUninstall();
  } else if (package_stamp === 'rpm') {
    rpmUninstall();
  }

  // Now run the upgrade script. Don't worry about leaving it in /tmp. That's
  // fine.
  kexec("/bin/bash " + upgradeScriptInTmp);
}).run();
