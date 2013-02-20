var amazon = AWSSum.load('amazon/amazon');
var S3 = AWSSum.load('amazon/s3', 'S3');
var Future = Npm.require("fibers/future");
var child_process = Npm.require("child_process");

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
      BucketName: "com.meteor.packages",
      ObjectName: ["unpublished", release, "manifest.json"].join("/")
    }).Body;
  } catch (e) {
    console.log("Release " + release + " not built.");
    process.exit(1);
  }

  return JSON.parse(content);
};

// are there any files with this prefix?
var notEmpty = function(s3, prefix) {
  var files = s3.ListObjects({
    BucketName: "com.meteor.packages",
    Prefix: prefix
  });
  return !_.isEmpty(files.Body.ListBucketResult.Contents);
};

// publish a given engine, copying multiple files from
// s3://com.meteor.packages/RELEASE/unpublished/ to
// s3://com.meteor.packages/engines/VERSION/
var publishEngine = function(s3, release, version) {
  var destPath = ["engines", version].join("/");

  process.stdout.write("Engine " + version + ": ");
  if (notEmpty(s3, destPath)) {
    console.log("already published");
    return;
  } else {
    console.log("publishing");
  }

  var engineArtifacts = s3.ListObjects({
    BucketName: "com.meteor.packages",
    Prefix: ["unpublished", release, "meteor-engine-"].join("/")
  }).Body.ListBucketResult.Contents;

  _.each(engineArtifacts, function (artifact) {
    var sourceKey = artifact.Key;
    var filename = _.last(sourceKey.split("/"));
    var destKey = [destPath, filename].join("/");

    var opts = {
      BucketName: "com.meteor.packages",
      ObjectName: destKey,
      SourceBucket: "com.meteor.packages",
      SourceObject: sourceKey
    };
    s3.CopyObject(opts);
  });
};

// publish a given package, copying from
// s3://com.meteor.packages/unpublished/RELEASE/NAME-VERSION.tar.gz to
// s3://com.meteor.packages/packages/NAME-VERSION.tar.gz
var publishPackage = function(s3, release, name, version) {
  var filename = name + "-" + version + ".tar.gz";
  var destKey = ["packages", name, filename].join("/");
  var sourceKey = ["unpublished", release, filename].join("/");

  process.stdout.write("Package " + name + " version " + version + ": ");
  if (notEmpty(s3, destKey)) {
    console.log("already published");
    return;
  } else {
    console.log("publishing");
  }

  var opts = {
    BucketName: "com.meteor.packages",
    ObjectName: destKey,
    SourceBucket: "com.meteor.packages",
    SourceObject: sourceKey
  };
  s3.CopyObject(opts);
};

// publish the release manifest, copying from
// s3://com.meteor.packages/unpublished/RELEASE/manifest.json to
// s3://com.meteor.packages/releases/RELEASE.json
var publishManifest = function(s3, release) {
  var destKey = ["releases", release + ".json"].join("/");
  var sourceKey = ["unpublished", release, "manifest.json"].join("/");

  process.stdout.write("Release manifest " + release + ": ");
  if (notEmpty(s3, destKey)) {
    console.log("already published");
    return;
  } else {
    console.log("publishing");
  }

  var opts = {
    BucketName: "com.meteor.packages",
    ObjectName: destKey,
    SourceBucket: "com.meteor.packages",
    SourceObject: sourceKey
  };
  s3.CopyObject(opts);
};

// START HERE
var main = function() {
  // read git sha, used as the version of the unpublished release.
  var release = getGitSha();
  var s3 = configureS3();
  var manifest = getManifest(s3, release);
  publishEngine(s3, release, manifest.engine);
  _.each(manifest.packages, function(version, name) {
    publishPackage(s3, release, name, version);
  });
  publishManifest(s3, release);
  process.exit();
};

main();