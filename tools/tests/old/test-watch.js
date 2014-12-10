var _ = require('underscore');
var assert = require('assert');
var crypto = require('crypto');
var Fiber = require('fibers');
var Future = require('fibers/future');
var watch = require('../../watch.js');
var files = require('../../files.js');

var tmp = files.mkdtemp('test_watch');
var serial = 0;

var touchFile = function (filePath, contents) {
  filePath = files.pathJoin(tmp, filePath);
  files.mkdir_p(files.pathDirname(filePath));
  files.writeFile(filePath, contents || ('' + serial));
  serial++;
};

var touchDir = function (dirPath) {
  dirPath = files.pathJoin(tmp, dirPath);
  files.mkdir_p(dirPath);
};

var remove = function (fileOrDirPath) {
  fileOrDirPath = files.pathJoin(tmp, fileOrDirPath);
  files.rm_recursive(fileOrDirPath);
};

var theWatcher;
var fired;
var firedFuture;
var lastOptions;
var go = function (options) {
  options = options || lastOptions;
  lastOptions = options;
  if (theWatcher) {
    theWatcher.stop();
    theWatcher = null;
  }
  fired = false;

  var watchSet = new watch.WatchSet();

  _.each(options.files, function (value, file) {
    file = files.pathJoin(tmp, file);
    if (value !== null && typeof value !== "string") {
      if (files.exists(file)) {
        var hash = crypto.createHash('sha1');
        hash.update(files.readFile(file));
        value = hash.digest('hex');
      } else {
        value = 'dummyhash';
      }
    }
    watchSet.addFile(file, value);
  });

  _.each(options.directories, function (dir) {
    // don't mutate options.directories, since we may reuse it with a no-arg
    // go() call
    var realDir = {
      absPath: files.pathJoin(tmp, dir.absPath),
      include: dir.include,
      exclude: dir.exclude
    };
    realDir.contents = dir.contents || watch.readDirectory(realDir);
    watchSet.addDirectory(realDir);
  });

  theWatcher = new watch.Watcher({
    watchSet: watchSet,
    onChange: function () {
      fired = true;
      if (firedFuture)
        firedFuture.return(true);
    }
  });
}

var fires = function (waitDuration) {
  if (! theWatcher)
    throw new Error("No watcher?");
  if (fired)
    return true;
  // Wait up to a second for it to fire
  var timeout = setTimeout(function () {
    firedFuture.return(false);
  }, waitDuration || 1000);
  if (firedFuture)
    throw new Error("Already have a future");
  firedFuture = new Future;
  var ret = firedFuture.wait();
  clearTimeout(timeout);
  firedFuture = null;
  return ret;
};

var waitForTopOfSecond = function () {
  while (true) {
    var msPastSecond = +(new Date) % 1000;
    if (msPastSecond < 100) {
      return;
    }
    delay(25);
  }
};

var delay = function (duration) {
  var f = new Future;
  setTimeout(function () {
    f.return();
  }, duration);
  f.wait();
};

Fiber(function () {
  console.log("Test Watcher");

  console.log("... one file");
  touchFile('/aa/b', 'kitten');
  go({
    files: { '/aa/b': true }
  });
  assert(!fires());
  touchFile('/aa/b', 'kitten');
  assert(!fires());
  touchFile('/aa/b', 'puppy');
  assert(fires());
  go();
  touchFile('/aa/b', 'puppy');
  assert(!fires());
  touchFile('/aa/b', 'kitten');
  assert(fires());
  go();
  remove('/aa/b');
  assert(fires());
  touchFile('/aa/b');
  go({
    files: { '/aa/b': true, '/aa/c': true }
  });
  assert(fires()); // look like /aa/c was removed
  go({
    files: { '/aa/b': true, '/aa/c': null }
  });
  assert(!fires());  // assert that /aa/c doesn't exist

  console.log("... directories");
  go({
    files: {'/aa/b': true },
    directories: [
      {absPath: '/aa',
       include: [/yes/, /maybe/, /aa/],
       exclude: [/not/, /never/],
       contents: []
      },
      {absPath: '/bb',
       include: [/.?/],
       contents: []
      }
    ]
  });
  assert(fires());  // because /bb doesn't exist
  touchDir('/bb');
  go();
  assert(!fires());
  touchFile('/aa/c');
  assert(!fires());
  touchFile('/aa/maybe-not');
  assert(!fires());
  touchFile('/aa/never-yes');
  assert(!fires());
  touchFile('/aa/never');
  assert(!fires());
  touchFile('/aa/yes-for-sure');
  assert(fires());

  go();
  touchFile('/aa/nope');
  assert(fires());  // because yes-for-sure isn't in 'contents'
  remove('/aa/yes-for-sure');
  go();
  assert(!fires());
  touchFile('/aa/maybe-this-time');
  assert(fires());
  go();
  assert(fires()); // maybe-this-time is still there
  go({
    files: {'/aa/b': true},
    directories: [
      {absPath: '/aa',
       include: [/yes/, /maybe/, /aa/],
       exclude: [/not/, /never/],
       contents: ['maybe-this-time']
      },
      {absPath: '/bb',
       include: [/.?/],
       contents: []
      }
    ]
  });
  go();
  assert(!fires()); // maybe-this-time is now in the expected file list
  touchFile('/aa/maybe-yes');
  assert(fires());
  remove('/aa/maybe-yes');
  remove('/aa/maybe-this-time');
  go();
  assert(fires()); // maybe-this-time is missing
  touchFile('/aa/maybe-this-time');
  touchDir('/aa/yes-i-said-yes-i-will-yes');
  go({
    directories: [
      {absPath: '/aa',
       include: [/yes/, /maybe/, /aa/],
       exclude: [/not/, /never/],
       contents: ['maybe-this-time']
      }
    ]
  });
  assert(fires());  // yes-i-said-yes-i-will-yes/ is missing
  go({
    directories: [
      {absPath: '/aa',
       include: [/yes/, /maybe/, /aa/],
       exclude: [/not/, /never/],
       contents: ['maybe-this-time', 'yes-i-said-yes-i-will-yes']
      }
    ]
  });
  assert(fires());  // yes-i-said-yes-i-will-yes is a dir, not a file
  go({
    directories: [
      {absPath: '/aa',
       include: [/yes/, /maybe/, /aa/],
       exclude: [/not/, /never/],
       contents: ['maybe-this-time', 'yes-i-said-yes-i-will-yes/']
      }
    ]
  });
  assert(!fires());
  // same directory, different filters
  go({
    directories: [
      // dirs
      {absPath: '/aa',
       include: [/\/$/],
       contents: ['yes-i-said-yes-i-will-yes/']
      },
      // files
      {absPath: '/aa',
       include: [/.?/],
       exclude: [/\/$/],
       contents: ['b', 'c', 'maybe-not', 'maybe-this-time', 'never',
                  'never-yes', 'nope']
      }
    ]
  });
  assert(!fires());
  touchFile('/aa/bla');
  assert(fires());

  // nb: these are supposed to verify that the "wait a second and try again"
  // logic works, but I couldn't get them to fail even when I turned that logic
  // off.
  console.log("... rapid changes to file");
  touchFile('/aa/x');
  waitForTopOfSecond();
  go({
    files: {'/aa/x': true }});
  touchFile('/aa/x');
  assert(fires(2000));

  go({
    directories: [
      {absPath: '/aa',
       include: [/yes/, /maybe/, /aa/],
       exclude: [/not/, /never/]
      }
    ]
  });
  assert(!fires());

  waitForTopOfSecond();
  touchFile('/aa/wtf');
  delay(600);
  touchFile('/aa/yes-indeed');
  assert(fires(2000));
  remove('/aa');

  console.log("Watcher test passed");
  theWatcher.stop();

}).run();


