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
      "Meteor has a brand new distribution system!\n" +
      "\n" +
      "In this new system, code-named Engine, packages are downloaded\n" +
      "individually and on demand. But all of the packages in each official\n" +
      "Meteor release are prefetched and cached so you can still use Meteor\n" +
      "when you're on a plane or in a coffeeshop with no Wifi.\n" +
      "\n" +
      "Also, every Meteor project is now pinned to a specific Meteor release,\n" +
      "so everyone on your team is always running the same code regardless of\n" +
      "what they have installed on their laptop. Whenever you run 'meteor',\n" +
      "Engine automatically fetches the needed release manifest, build tools,\n" +
      "smart packages, and npm dependencies into your local warehouse.\n" +
      "\n" +
      "Removing your current installation.\n");

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
