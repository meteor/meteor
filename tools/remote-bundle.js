var _ = require('underscore');
var files = require('./files.js');
var buildmessage = require('./buildmessage.js');
var auth = require('./auth.js');
var authClient = require('./auth-client.js');
var Future = require('fibers/future');
var runLog = require('./run-log.js');
var utils = require('./utils.js');
var config = require('./config.js');
var archinfo = require('./archinfo.js');
var execFileSync = require('./utils.js').execFileSync;
var Console = require('./console.js').Console;
var projectContextModule = require('./project-context.js');
var colonConverter = require('./colon-converter.js');
var child_process = require('child_process');

exports.createRemoteBundle = function (buildDir, arch) {
  // Set the minutes. We will check validity on the server. Hopefully, it will
  // take less than 5 minutes to bundle an app?
  // XXX: Ekate Hax.
  var minutes = 5;

  try {
    Console.info("Logging into the get-machines server ...");
    var conn = authClient.loggedInConnection(
      config.getBuildFarmUrl(),
      config.getBuildFarmDomain(),
      "build-farm");
  } catch (err) {
    authClient.handleConnectionError(err, "get-machines server");
    return 1;
  }

  try {
    Console.info("Reserving machine ...");

    // The server returns to us an object with the following keys:
    // username & sshKey : use this to log in.
    // host: what you login into
    // port: port you should use
    // hostKey: RSA key to compare for safety.
    var ret = conn.call('createBuildServer', arch, minutes);
  } catch (err) {
    authClient.handleConnectionError(err, "build farm");
    return 1;
  }
  conn.close();

  // Record the SSH Key in a temporary file on disk and give it the permissions
  // that ssh-agent requires it to have.
  var tmpDir = files.mkdtemp('meteor-ssh-');
  var idpath = tmpDir + '/id';
  // Save the temp ID key  "Writing ssh key to " + idpath;
  files.writeFile(idpath, ret.sshKey, {encoding: 'utf8', mode: 0400});

  // Add the known host key to a custom known hosts file.
  var hostpath = tmpDir + '/host';
  var addendum = ret.host + " " + ret.hostKey + "\n";
  // Save the temp host key "Writing host key to " + hostpath);
  files.writeFile(hostpath, addendum, 'utf8');

  // XXX: There is some MAD hackery here. This won't pick up something like
  // the PACKAGE_DIRS environment variable. Realistically, we should probably
  // try to get a clean set first.

  // (In fact, this won't pick up most files for most apps, but whatevs)

  // This is our login.
  var loginBare = ret.username + "@" + ret.host;
  var appDir = "/tmp/my-app";
  var login = loginBare + ":" + appDir;
  var loginInternal = login + "/.meteor";
  var connOptions = [
    ["-i" + idpath, "-p" + ret.port, "-oUserKnownHostsFile=" + hostpath,
     "./*.js", login],
    ["-i" + idpath, "-p" + ret.port, "-oUserKnownHostsFile=" + hostpath,
     "./*.css", login],
    ["-i" + idpath, "-p" + ret.port, "-oUserKnownHostsFile=" + hostpath,
     "./*.html", login],
    ["-i" + idpath, "-p" + ret.port, "-oUserKnownHostsFile=" + hostpath,
     "./.meteor/packages", loginInternal],
    ["-i" + idpath, "-p" + ret.port, "-oUserKnownHostsFile=" + hostpath,
     "./.meteor/versions", loginInternal],
    ["-i" + idpath, "-p" + ret.port, "-oUserKnownHostsFile=" + hostpath,
     "./.meteor/npm-packages", loginInternal],
    ["-i" + idpath, "-p" + ret.port, "-oUserKnownHostsFile=" + hostpath,
     "./.meteor/platforms", loginInternal],
    ["-i" + idpath, "-p" + ret.port, "-oUserKnownHostsFile=" + hostpath,
     "./.meteor/release", loginInternal]
  ];

  // XXX: Fix this so hard.
  var result = buildmessage.enterJob({ title: "uploading" }, function () {
    _.each(connOptions, function (myConnOpts) {
      callSCP(myConnOpts);
    });
    return 0;
  });

  // XXX: Publish a release with some of this code. Specifically, the bundler.
  // XXX: Run 'meteor bundle' remotely.
  var bundleDir = "/tmp/my-awesome-bundle";
  var command = "cd " + appDir + "; meteor bundle " + bundleDir + "--directory";
  var newOpts =
     ["-i" + idpath, "-p" + ret.port, "-oUserKnownHostsFile=" + hostpath,
     loginBare, command];
  callSSH(newOpts);


  // XXX: This is going to take way too long IRL
  var loginBun = loginBare +  ":" + bundleDir;
  var downOptions =
    ["-i" + idpath, "-p" + ret.port, "-oUserKnownHostsFile=" + hostpath, "-r",
     loginBun, ".remote-bundle"];

  result = buildmessage.enterJob({ title: "downloading" }, function () {
    callSCP(downOptions);
  });

  // Remember to untar the tar file that we are downloading.


  // Then, copy it over.
  //  files.cp_r('/Users/ekate/demo/old-age2', buildDir);
  //  return 0;


  Console.info("That's it for now, folks.");
};



var callSCP = function (connOptions) {
  return callStuff(connOptions, "scp");
};

var callSSH = function (connOptions) {
  return callStuff(connOptions, "ssh");
};


var callStuff = function (connOptions, command) {
  var printOptions = connOptions.join(' ');

//  Console.info("Connecting: " + Console.command("scp -r " + printOptions));


  var future = new Future;
  var sshCommand = child_process.spawn(command, connOptions);
  sshCommand.on('exit', function (code, signal) {
    if (signal) {
      // XXX: We should process the signal in some way, but I am not sure we
      // care right now.
      future.return(1);
    } else {
      future.return(code);
    }
  });
  var sshEnd = future.wait();

  return sshEnd;
};
