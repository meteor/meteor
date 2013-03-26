var amazon = AWSSum.load('amazon/amazon');
var S3 = AWSSum.load('amazon/s3', 'S3');
var Fiber = Npm.require("fibers");
var Future = Npm.require("fibers/future");
var child_process = Npm.require("child_process");

var die = function (msg) {
  console.error(msg);
  process.exit(1);
};

var doOrDie = function (errorMessage, f) {
  try {
    return f();
  } catch (e) {
    die(errorMessage);
  }
};

// accumulated while running, printed at the end
var publishedArtifacts = [];

var getFromSettings = function (key) {
  var val = Meteor.settings[key];
  if (!val) {
    die("Run via publish-release.sh");
  }
  return val;
};

// gets git sha passed in via --settings
var getGitSha = function () {
  return getFromSettings('git-sha');
};

// gets release name passed in via --settings
var getReleaseName = function () {
  return getFromSettings('release-name');
};

// runs a command, returns stdout.
// XXX should we have a smart package for these? 'process'?
var execFileSync = function (binary, args) {
  return Future.wrap(function(cb) {
    var cb2 = function(err, stdout, stderr) { cb(err, stdout); };
    child_process.execFile(binary, args, cb2);
  })().wait();
};

// returns usable S3 object
var configureS3 = function () {
  // calls 's3cmd --dump-config', returns {accessKey: ..., secretKey: ...}
  var getS3Credentials = function () {
    var unparsedConfig = execFileSync("s3cmd", ["--dump-config"]);
    var accessKey = /access_key = (.*)/.exec(unparsedConfig)[1];
    var secretKey = /secret_key = (.*)/.exec(unparsedConfig)[1];
    return {accessKey: accessKey, secretKey: secretKey};
  };

  var s3Credentials = getS3Credentials();
  var s3 = new S3({
    accessKeyId: s3Credentials.accessKey,
    secretAccessKey: s3Credentials.secretKey,
    region: amazon.US_EAST_1
  });

  return s3;
};

// fetch and parse release manifest
var getManifest = function(s3, gitSha) {
  var content = doOrDie("Release " + gitSha + " not built.", function () {
    return s3.GetObject({
      BucketName: "com.meteor.warehouse",
      ObjectName: ["unpublished", gitSha, "release.json"].join("/")
    }).Body;
  });

  return JSON.parse(content);
};

// are there any files with this prefix?
var anyWithPrefix = function(s3, prefix) {
  var files = s3.ListObjects({
    BucketName: "com.meteor.warehouse",
    Prefix: prefix
  });
  return !_.isEmpty(files.Body.ListBucketResult.Contents);
};

// publish a given tools, copying multiple files from
// s3://com.meteor.warehouse/unpublished/GITSHA/ to
// s3://com.meteor.warehouse/tools/VERSION/
var publishTools = function(s3, gitSha, version) {
  var destPath = ["tools", version].join("/");

  process.stdout.write("tools " + version + ": ");
  if (anyWithPrefix(s3, destPath)) {
    console.log("already published");
    return;
  } else {
    publishedArtifacts.push("tools " + version);
    console.log("publishing");
  }

  var toolsArtifacts = s3.ListObjects({
    BucketName: "com.meteor.warehouse",
    Prefix: ["unpublished", gitSha, "meteor-tools-"].join("/")
  }).Body.ListBucketResult.Contents;

  parallelEach(toolsArtifacts, function (artifact) {
    var sourceKey = artifact.Key;
    var filename = _.last(sourceKey.split("/"));
    var destKey = [destPath, filename].join("/");

    var opts = {
      BucketName: "com.meteor.warehouse",
      ObjectName: destKey,
      SourceBucket: "com.meteor.warehouse",
      SourceObject: sourceKey,
      Acl: "public-read"
    };
    s3.CopyObject(opts);
  });
};

// publish a given package, copying from
// s3://com.meteor.warehouse/unpublished/GITSHA/NAME-VERSION.tar.gz to
// s3://com.meteor.warehouse/packages/NAME-VERSION.tar.gz
var publishPackage = function(s3, gitSha, name, version) {
  var filename = name + "-" + version + ".tar.gz";
  var destKey = ["packages", name, filename].join("/");
  var sourceKey = ["unpublished", gitSha, filename].join("/");

  var packageHeader = "package " + name + " version " + version + ": ";
  if (anyWithPrefix(s3, destKey)) {
    console.log(packageHeader + "already published");
    return;
  } else {
    publishedArtifacts.push("package " + name + " version " + version);
    console.log(packageHeader + "publishing");
  }

  var opts = {
    BucketName: "com.meteor.warehouse",
    ObjectName: destKey,
    SourceBucket: "com.meteor.warehouse",
    SourceObject: sourceKey,
    Acl: "public-read"
  };
  s3.CopyObject(opts);
};

// publish the release manifest, copying from
// s3://com.meteor.warehouse/unpublished/GITSHA/release.json to
// s3://com.meteor.warehouse/releases/RELEASE.release.json
var publishManifest = function(s3, gitSha, release) {
  var destKey = ["releases", release + ".release.json"].join("/");
  var sourceKey = ["unpublished", gitSha, "release.json"].join("/");

  process.stdout.write("release manifest read from " + gitSha + ": ");
  if (anyWithPrefix(s3, destKey)) {
    console.log("already published at " + release);
    return;
  } else {
    publishedArtifacts.push("release manifest " + release);
    console.log("publishing");
  }

  var opts = {
    BucketName: "com.meteor.warehouse",
    ObjectName: destKey,
    SourceBucket: "com.meteor.warehouse",
    SourceObject: sourceKey,
    Acl: "public-read"
  };
  s3.CopyObject(opts);
};

var parallelEach = function (collection, callback, context) {
  var futures = _.map(collection, function () {
    var args = _.toArray(arguments);
    return function () {
      callback.apply(context, args);
    }.future()();
  });
  Future.wait(futures);
  // Throw if any threw.
  _.each(futures, function (f) { f.get(); });
};

// START HERE
var main = function() {
  // read git sha, used as the version of the unpublished release.
  var gitSha = getGitSha();
  var release = getReleaseName();

  if (/^([0-9]+\.)+[0-9]+$/.test(release)) {
    console.error(
      "It looks like you're trying to publish a final release (%s).", release);
    die("Final releases should always be blessed from an RC release.");
  }

  var gitTag;
  // Are we trying to give this release a name that isn't its sha?
  if (release !== gitSha) {
    gitTag = "release/" + release;
    // Check to see if the release name is going to work in git.
    doOrDie("Bad release name " + release, function () {
      execFileSync("git", ["check-ref-format", "--allow-onelevel", gitTag]);
    });
    execFileSync("git", ["tag", gitTag, gitSha]);
  }

  var s3 = configureS3();
  var manifest = getManifest(s3, gitSha);
  publishTools(s3, gitSha, manifest.tools);
  parallelEach(manifest.packages, function(version, name) {
    publishPackage(s3, gitSha, name, version);
  });
  publishManifest(s3, gitSha, release);

  if (gitTag !== undefined) {
    console.log("Pushing git tag " + gitTag);
    execFileSync("git", ["push",
                         "git@github.com:meteor/meteor.git",
                         "refs/tags/" + gitTag]);
  }

  console.log("\nPUBLISHED:\n" + publishedArtifacts.join('\n'));
  console.log();
  process.exit();
};

main();
