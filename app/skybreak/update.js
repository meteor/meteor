var fs = require("fs");
var https = require("https");
var path = require("path");
var spawn = require('child_process').spawn;
var url = require("url");

var ProgressBar = require('progress');

var updater = require("../lib/updater.js");
var files = require("../lib/files.js");

updater.get_manifest(function (manifest) {
  if (!manifest) {
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
  var download_url = url.parse(manifest.url);
  // XXX why is node's API for url different from http?
  download_url.path = download_url.pathname;

  var req = https.request(download_url, function(res) {
    if (res.statusCode !== 200) {
      console.log("Failed to download: " + manifest.url);
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
    var base_dir = path.join(__dirname, "../../");
    var tmp_dir = path.join(base_dir, "tmp");
    try { fs.mkdirSync(tmp_dir, 0755); } catch (err) { }

    // open pipe to tar
    var tar_proc = spawn("tar", ["-C", tmp_dir, "-xzf", "-"]);

    // XXX
    tar_proc.stderr.setEncoding('utf8');
    tar_proc.stderr.on('data', function (data) {
      console.log(data);
    });

    res.on('data', function (chunk) {
      tar_proc.stdin.write(chunk);
      bar.tick(chunk.length);
    });
    res.on('end', function () {
      console.log("... finished download");
      tar_proc.stdin.end();
      tar_proc.on('exit', function (code, signal) {
        if (code !== 0 || signal) {
          console.log("failed to untar download");
          return;
        }

        // untar complete. swap directories
        var old_base_dir = base_dir.slice(0,-1) + ".old";
        if (path.existsSync(old_base_dir))
          files.rm_recursive(old_base_dir); // rm -rf !!

        fs.renameSync(base_dir, old_base_dir);
        fs.renameSync(old_base_dir + "/tmp/skybreak", base_dir);

        // Launch post-upgrade script
        var nodejs_path = path.join(base_dir, 'bin', 'node');
        var postup_path = path.join(base_dir, 'app', 'skybreak', 'post-upgrade.js');
        if (path.existsSync(nodejs_path) && path.existsSync(postup_path)) {
          var postup_proc = spawn(nodejs_path, [postup_path]);
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
      });
    });
  });
  req.end();

});
