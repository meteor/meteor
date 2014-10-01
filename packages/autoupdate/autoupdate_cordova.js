var DEBUG_TAG = 'METEOR CORDOVA DEBUG (autoupdate_cordova.js) ';
var log = function (msg) {
  console.log(DEBUG_TAG + msg);
};

// This constant was picked by testing on iOS 7.1
// We limit the number of concurrent downloads because iOS gets angry on the
// application when a certain limit is exceeded and starts timing-out the
// connections in 1-2 minutes which makes the whole HCP really slow.
var MAX_NUM_CONCURRENT_DOWNLOADS = 30;
var MAX_RETRY_COUNT = 5;

var autoupdateVersionCordova = __meteor_runtime_config__.autoupdateVersionCordova || "unknown";

// The collection of acceptable client versions.
ClientVersions = new Meteor.Collection("meteor_autoupdate_clientVersions");

Autoupdate = {};

Autoupdate.newClientAvailable = function () {
  return !! ClientVersions.findOne({
    _id: 'version-cordova',
    version: {$ne: autoupdateVersionCordova}
  });
};

var writeFile = function (directoryPath, fileName, content, cb) {
  var fail = function (err) {
    cb(new Error("Failed to write file: ", err), null);
  };

  window.resolveLocalFileSystemURL(directoryPath, function (dirEntry) {
    var success = function (fileEntry) {
      fileEntry.createWriter(function (writer) {
        writer.onwrite = function (evt) {
          var result = evt.target.result;
          cb(null, result);
        };
        writer.onerror = fail;
        writer.write(content);
      }, fail);
    };

    dirEntry.getFile(fileName, {
      create: true,
      exclusive: false
    }, success, fail);
  }, fail);
};

var restartServer = function (location) {
  log('restartServer with location ' + location);
  var fail = function (err) { log("Unexpected error in restartServer: " + err.message) };
  var httpd = cordova && cordova.plugins && cordova.plugins.CordovaUpdate;

  if (! httpd) {
    fail(new Error('no httpd'));
    return;
  }

  var startServer = function (cordovajsRoot) {
    httpd.startServer({
      'www_root' : location,
      'cordovajs_root': cordovajsRoot
    }, function (url) {
      Package.reload.Reload._reload();
    }, fail);
  };

  httpd.getCordovajsRoot(function (cordovajsRoot) {
    startServer(cordovajsRoot);
  }, fail);
};

var hasCalledReload = false;
var onNewVersion = function () {
  var ft = new FileTransfer();
  var urlPrefix = Meteor.absoluteUrl() + '__cordova';

  var localPathPrefix = cordova.file.applicationStorageDirectory +
                        'Documents/meteor/';


  HTTP.get(urlPrefix + '/manifest.json', function (err, res) {
    if (err || ! res.data) {
      log('Failed to download the manifest ' + (err && err.message) + ' ' + (res && res.content));
      return;
    }

    var program = res.data;
    var manifest = _.clone(program.manifest);
    var version = program.version;
    var ft = new FileTransfer();

    manifest.push({ url: '/index.html?' + Random.id() });

    var versionPrefix = localPathPrefix + version;

    var queue = [];
    _.each(manifest, function (item) {
      if (! item.url) return;

      var url = item.url;
      url = url.replace(/\?.+$/, '');

      queue.push(url);
    });

    var afterAllFilesDownloaded = _.after(queue.length, function () {
      var wroteManifest = function (err) {
        if (err) {
          log("Failed to write manifest.json: " + err);
          // XXX do something smarter?
          return;
        }

        // success! downloaded all sources and saved the manifest
        // save the version string for atomicity
        writeFile(localPathPrefix, 'version', version,
            function (err) {
          if (err) {
            log("Failed to write version: " + err);
            return;
          }

          // don't call reload twice!
          if (! hasCalledReload) {
            // relative to 'bundle.app/www'
            var location = '../../Documents/meteor/' + version;
            restartServer(location);
          }
        });
      };

      writeFile(versionPrefix, 'manifest.json',
                JSON.stringify(program, undefined, 2), wroteManifest);
    });

    var dowloadUrl = function (url) {
      console.log(DEBUG_TAG + "start dowloading " + url);
      // Add a cache buster to ensure that we don't cache an old asset.
      var uri = encodeURI(urlPrefix + url + '?' + Random.id());

      // Try to dowload the file a few times.
      var tries = 0;
      var tryDownload = function () {
        ft.download(uri, versionPrefix + url, function (entry) {
          if (entry) {
            console.log(DEBUG_TAG + "done dowloading " + url);
            // start downloading next queued url
            if (queue.length)
              dowloadUrl(queue.shift());
            afterAllFilesDownloaded();
          }
        }, function (err) {
          // It failed, try again if we have tried less than 5 times.
          if (tries++ < MAX_RETRY_COUNT) {
            log("Download error, will retry (#" + tries + "): " + uri);
            tryDownload();
          } else {
            log('Download failed: ' + err + ", source=" + err.source + ", target=" + err.target);
          }
        });
      };

      tryDownload();
    };

    _.times(Math.min(MAX_NUM_CONCURRENT_DOWNLOADS, queue.length), function () {
      var nextUrl = queue.shift();
      // XXX defer the next download so iOS doesn't rate limit us on concurrent
      // downloads
      Meteor.setTimeout(dowloadUrl.bind(null, nextUrl), 50);
    });
  });
};

var retry = new Retry({
  minCount: 0, // don't do any immediate retries
  baseTimeout: 30*1000 // start with 30s
});
var failures = 0;

Autoupdate._retrySubscription = function () {
  var appId = __meteor_runtime_config__.appId;
  Meteor.subscribe("meteor_autoupdate_clientVersions", appId, {
    onError: function (err) {
      Meteor._debug("autoupdate subscription failed:", err);
      failures++;
      retry.retryLater(failures, function () {
        // Just retry making the subscription, don't reload the whole
        // page. While reloading would catch more cases (for example,
        // the server went back a version and is now doing old-style hot
        // code push), it would also be more prone to reload loops,
        // which look really bad to the user. Just retrying the
        // subscription over DDP means it is at least possible to fix by
        // updating the server.
        Autoupdate._retrySubscription();
      });
    }
  });
  if (Package.reload) {
    var checkNewVersionDocument = function (doc) {
      var self = this;
      if (doc.version !== autoupdateVersionCordova) {
        onNewVersion();
      }
    };

    var handle = ClientVersions.find({
      _id: 'version-cordova'
    }).observe({
      added: checkNewVersionDocument,
      changed: checkNewVersionDocument
    });
  }
};

Meteor.startup(Autoupdate._retrySubscription);

