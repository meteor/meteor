var amazon = AWSSum.load('amazon/amazon');
var S3 = AWSSum.load('amazon/s3', 'S3');
var Fiber = Npm.require("fibers");
var Future = Npm.require("fibers/future");
var child_process = Npm.require("child_process");

// accumulated while running, printed at the end
var publishedArtifacts = [];

// gets git sha passed in via --settings
var getGitSha = function () {
  var gitSha = Meteor.settings["git-sha"];
  if (!gitSha) {
    console.log("Run with --settings to set 'git-sha'");
    process.exit(1);
  }
  return gitSha;
};

// calls 'cmd', returns stdout.
// XXX should we have a smart package for these? 'process'?
var execSync = function (cmd) {
  return Future.wrap(function(cb) {
    var cb2 = function(err, stdout, stderr) { cb(err, stdout); };
    child_process.exec(cmd, cb2);
  })().wait();
};

// returns usable S3 object
var configureS3 = function () {
  // calls 's3cmd --dump-config', returns {accessKey: ..., secretKey: ...}
  var getS3Credentials = function () {
    var unparsedConfig = execSync("s3cmd --dump-config");
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
var getManifest = function(s3, release) {
  var content;
  try {
    content = s3.GetObject({
      BucketName: "com.meteor.warehouse",
      ObjectName: ["unpublished", release, "manifest.json"].join("/")
    }).Body;
  } catch (e) {
    console.log("Release " + release + " not built.");
    process.exit(1);
  }

  return JSON.parse(content);
};

// are there any files with this prefix?
var noneWithPrefix = function(s3, prefix) {
  var files = s3.ListObjects({
    BucketName: "com.meteor.warehouse",
    Prefix: prefix
  });
  return !_.isEmpty(files.Body.ListBucketResult.Contents);
};

// publish a given engine, copying multiple files from
// s3://com.meteor.warehouse/RELEASE/unpublished/ to
// s3://com.meteor.warehouse/engines/VERSION/
var publishEngine = function(s3, release, version) {
  var destPath = ["engines", version].join("/");

  process.stdout.write("engine " + version + ": ");
  if (noneWithPrefix(s3, destPath)) {
    console.log("already published");
    return;
  } else {
    publishedArtifacts.push("engine " + version);
    console.log("publishing");
  }

  var engineArtifacts = s3.ListObjects({
    BucketName: "com.meteor.warehouse",
    Prefix: ["unpublished", release, "meteor-engine-"].join("/")
  }).Body.ListBucketResult.Contents;

  _.each(engineArtifacts, function (artifact) {
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
// s3://com.meteor.warehouse/unpublished/RELEASE/NAME-VERSION.tar.gz to
// s3://com.meteor.warehouse/packages/NAME-VERSION.tar.gz
var publishPackage = function(s3, release, name, version) {
  var filename = name + "-" + version + ".tar.gz";
  var destKey = ["packages", name, filename].join("/");
  var sourceKey = ["unpublished", release, filename].join("/");

  var packageHeader = "package " + name + " version " + version + ": ";
  if (noneWithPrefix(s3, destKey)) {
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
// s3://com.meteor.warehouse/unpublished/RELEASE/manifest.json to
// s3://com.meteor.warehouse/releases/RELEASE.release.json
var publishManifest = function(s3, release) {
  var destKey = ["releases", release + ".release.json"].join("/");
  var sourceKey = ["unpublished", release, "manifest.json"].join("/");

  process.stdout.write("release manifest " + release + ": ");
  if (noneWithPrefix(s3, destKey)) {
    console.log("already published");
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
};

// START HERE
var main = function() {
  // read git sha, used as the version of the unpublished release.
  var release = getGitSha();
  var s3 = configureS3();
  var manifest = getManifest(s3, release);
  publishEngine(s3, release, manifest.engine);
  parallelEach(manifest.packages, function(version, name) {
    publishPackage(s3, release, name, version);
  });
  publishManifest(s3, release);
  console.log("\nPUBLISHED:\n" + publishedArtifacts.join('\n'));
  console.log();
  process.exit();
};

main();