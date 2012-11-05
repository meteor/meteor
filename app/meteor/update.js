var fs = require("fs");
var https = require("https");
var os = require("os");
var path = require("path");
var spawn = require('child_process').spawn;
var url = require("url");

var ProgressBar = require('progress');

var updater = require(path.join(__dirname, "..", "lib", "updater.js"));
var files = require(path.join(__dirname, "..", "lib", "files.js"));

var _ = require(path.join(__dirname, '..', 'lib', 'third', 'underscore.js'));

// refuse to update if we're in a git checkout.
if (files.in_checkout()) {
  console.log("This is a git checkout. Update it manually with 'git pull'.");
  process.exit(1);
}

// Immediately kick off manifest check.
updater.get_manifest(function (manifest) {

  //// Examine manifest and see if we need to upgrade.

  if (!manifest || !manifest.version || !manifest.urlbase) {
    console.log("Failed to download manifest.");
    return;
  }

  if (!updater.needs_upgrade(manifest)) {
    if (manifest.version === updater.CURRENT_VERSION) {
      console.log("Already at current version: " + manifest.version);
    } else {
      console.log("Not upgrading. Your version: " + updater.CURRENT_VERSION
                  + ". New version: " + manifest.version + ".");
    }
    return;
  }

  console.log("New version available: " + manifest.version);

  //// Setup post-upgrade function so we can call it later
  var post_remove_directories = [];
  var cleanup_temp_dirs = function () {
    _.each(post_remove_directories, files.rm_recursive);
    post_remove_directories = [];
  };

  var run_post_upgrade = function () {
    cleanup_temp_dirs();

    // Launch post-upgrade script
    var nodejs_path = path.join(files.get_dev_bundle(), 'bin', 'node');
    var postup_path = path.join(files.get_core_dir(), 'meteor', 'post-upgrade.js');

    if (fs.existsSync(nodejs_path) && fs.existsSync(postup_path)) {
      // setup environment.
      var modules_path = path.join(files.get_dev_bundle(), 'lib', 'node_modules');
      var env = _.extend({}, process.env);
      env.NODE_PATH = modules_path;

      // launch it.
      var postup_proc = spawn(nodejs_path, [postup_path], {env: env});
      postup_proc.stderr.setEncoding('utf8');
      postup_proc.stderr.on('data', function (data) {
        process.stderr.write(data);
      });
      postup_proc.stdout.setEncoding('utf8');
      postup_proc.stdout.on('data', function (data) {
        process.stdout.write(data);
      });
    } else {
      // no postup. Still print a message, but one that is subtly
      // different so developers can debug what is going on.
      console.log("upgrade complete.");
    }
  };

  var run_with_root = function (cmd, args) {
    if (0 === process.getuid()) {
      // already root. just spawn the command.
      return spawn(cmd, args);
    } else if (fs.existsSync("/bin/sudo") ||
               fs.existsSync("/usr/bin/sudo")) {
      // spawn a sudo
      console.log("Since this system includes sudo, Meteor will request root privileges to");
      console.log("install. You may be prompted for a password. If you prefer to not use");
      console.log("sudo, please re-run this command as root.");
      console.log("sudo", cmd, args.join(" "));
      return spawn('sudo', [cmd].concat(args));
    }

    // no root, no sudo. fail
    console.log("Meteor requires root privileges to install. Please re-run this command");
    console.log("as root.");
    process.exit(1);
    return null; // unreached, but makes js2 mode happy.
  };


  //// Figure out what platform we're upgrading on (dpkg, rpm, tar)

  var package_stamp_path = path.join(files.get_dev_bundle(), '.package_stamp');
  var package_stamp;
  try {
    package_stamp = fs.readFileSync(package_stamp_path, 'utf8');
    package_stamp = package_stamp.replace(/^\s+|\s+$/g, '');
  } catch (err) {
    // no package stamp, assume tarball.
    package_stamp = 'tar';
  }

  var download_url; // url to download
  var download_callback; // callback to call with path on disk of download.

  var arch = os.arch();
  var deb_arch;
  var rpm_arch;
  if ("ia32" == arch) {
    deb_arch = "i386";
    rpm_arch = "i386";
    arch = "i686";
  } else if ("x64" == arch) {
    deb_arch = "amd64";
    rpm_arch = "x86_64";
    arch = "x86_64";
  } else {
    console.log("Unsupported architecture", arch);
    return;
  }

  if ('deb' === package_stamp) {
    download_url =
      manifest.urlbase + "/meteor_" + manifest.deb_version +
      "_" + deb_arch + ".deb";

    download_callback = function (deb_path) {
      var proc =  run_with_root('dpkg', ['-i', deb_path]);
      proc.on('exit', function (code, signal) {
        if (code !== 0 || signal) {
          console.log("failed to install deb");
          return;
        }
        // success!
        run_post_upgrade();
      });
    };

  } else if ('rpm' === package_stamp) {
    download_url =
      manifest.urlbase + "/meteor-" + manifest.rpm_version +
      "." + rpm_arch + ".rpm";

    download_callback = function (rpm_path) {
      var proc = run_with_root('rpm', ['-U', '--force', rpm_path]);
      proc.on('exit', function (code, signal) {
        if (code !== 0 || signal) {
          console.log("Error: failed to install Meteor RPM package.");
          return;
        }
        // success!
        run_post_upgrade();
      });
    };

  } else {

    download_url =
      manifest.urlbase + "/meteor-package-" + os.type() +
      "-" + arch + "-" + manifest.version + ".tar.gz";

    download_callback = function (tar_path) {
      var base_dir = path.join(__dirname, "..", "..");
      var tmp_dir = path.join(base_dir, "tmp");
      // XXX error check!
      try { fs.mkdirSync(tmp_dir, 0755); } catch (err) { }

      // open pipe to tar
      var tar_proc = spawn("tar", ["-C", tmp_dir, "-xzf", tar_path]);

      tar_proc.stderr.setEncoding('utf8');
      tar_proc.stderr.on('data', function (data) {
        console.log(data);
      });

      tar_proc.on('exit', function (code, signal) {
        if (code !== 0 || signal) {
          console.log("Error: package download failed.");
          return;
        }

        // untar complete. swap directories
        var old_base_dir = base_dir + ".old";
        if (fs.existsSync(old_base_dir))
          files.rm_recursive(old_base_dir); // rm -rf !!

        fs.renameSync(base_dir, old_base_dir);
        fs.renameSync(path.join(old_base_dir, "tmp", "meteor"), base_dir);

        // success!
        run_post_upgrade();
      });

    };
  }

  //// Kick off download

  var download_parsed = url.parse(download_url);
  // XXX why is node's API for 'url' different from 'http'?
  download_parsed.path = download_parsed.pathname;

  var req = https.request(download_parsed, function(res) {
    if (res.statusCode !== 200) {
      console.log("Failed to download: " + download_url);
      return;
    }
    var len = parseInt(res.headers['content-length'], 10);

    var bar = new ProgressBar('  downloading [:bar] :percent', {
      complete: '='
      , incomplete: ' '
      , width: 30
      , total: len
    });

    // find / make directory paths
    var tmp_dir = files.mkdtemp();
    post_remove_directories.push(tmp_dir);

    // open tempfile
    var download_path = path.join(tmp_dir, path.basename(download_url));
    var download_stream = fs.createWriteStream(download_path);

    res.on('data', function (chunk) {
      download_stream.write(chunk);
      bar.tick(chunk.length);
    });

    res.on('end', function () {
      download_stream.end();
      console.log("... finished download");
      download_callback(download_path);
      // don't remove temp dir here, download_callback is probably still
      // using it.
    });
  });
  req.end();

});
