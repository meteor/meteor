var path = require('path');
var fs = require('fs');
var _ = require('underscore');
var assert = require('assert');
var crypto = require('crypto');
var Fiber = require('fibers');
var Future = require('fibers/future');
var watch = require(path.join(__dirname, '..', 'watch.js'));
var files = require(path.join(__dirname, '..', 'files.js'));

var tmp = files.mkdtemp('test_watch');
var serial = 0;

var touchFile = function (filePath, contents) {
  filePath = path.join(tmp, filePath);
  files.mkdir_p(path.dirname(filePath));
  fs.writeFileSync(filePath, contents || ('' + serial));
  serial++;
};

var touchDir = function (dirPath) {
  dirPath = path.join(tmp, dirPath);
  files.mkdir_p(dirPath);
};

var remove = function (fileOrDirPath) {
  fileOrDirPath = path.join(tmp, fileOrDirPath);
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

  var files = {};
  _.each(options.files, function (value, file) {
    file = path.join(tmp, file);
    if (typeof value !== "string") {
      if (fs.existsSync(file)) {
        var hash = crypto.createHash('sha1');
        hash.update(fs.readFileSync(file));
        value = hash.digest('hex');
      } else {
        value = 'dummyhash';
      }
    }
    files[file] = value;
  });

  var directories = {};
  _.each(options.directories, function (options, dir) {
    dir = path.join(tmp, dir);
    directories[dir] = options;
  });

  theWatcher = new watch.Watcher({
    files: files,
    directories: directories,
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
    var f = new Future;
    setTimeout(function () {
      f.return();
    }, 25);
    f.wait();
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

  console.log("... directories");
  go({
    files: {'/aa/b': true },
    directories: {'/aa': {
      include: [/yes/, /maybe/, /aa/],
      exclude: [/not/, /never/]
    }}
  });
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
  assert(fires()); // because yes-for-sure isn't in the file list
  remove('/aa/yes-for-sure');
  go();
  assert(!fires());
  touchFile('/aa/maybe-this-time');
  assert(fires());
  go();
  assert(fires()); // maybe-this-time is still there
  go({
    files: {'/aa/b': true, '/aa/maybe-this-time': true },
    directories: {'/aa': {
      include: [/yes/, /maybe/, /aa/],
      exclude: [/not/, /never/]
    }}
  });
  go();
  assert(!fires()); // maybe-this-time is now in the expected file list
  touchFile('/aa/maybe-yes');
  assert(fires());
  remove('/aa/maybe-yes');
  remove('/aa/maybe-this-time');
  go();
  assert(fires()); // maybe-this-time is missing

  console.log("... recursive directories");
  touchFile('/aa/b');
  go({
    files: {'/aa/b': true },
    directories: {'/aa': {
      include: [/yes/, /maybe/, /aa/],
      exclude: [/not/, /never/]
    }}
  });
  touchDir('/aa/yess');
  assert(!fires());
  remove('/aa/yess');
  assert(!fires());
  touchFile('/aa/yess/kitten');
  assert(!fires());
  touchFile('/aa/yess/maybe');
  assert(fires());
  remove('/aa/yess');
  go();
  touchFile('/aa/whatever/kitten');
  assert(!fires());
  touchFile('/aa/whatever/maybe');
  assert(fires());

  remove('/aa/whatever');
  go();
  touchDir('/aa/i/love/subdirectories');
  assert(!fires());
  touchFile('/aa/i/love/subdirectories/yessir');
  assert(fires());
  remove('/aa/i/love/subdirectories/yessir');
  go();
  touchFile('/aa/i/love/subdirectories/every/day');
  assert(!fires());
  remove('/aa/i/love/subdirectories');
  assert(!fires());
  touchFile('/aa/i/love/not/nothing/yes');
  assert(!fires());
  touchFile('/aa/i/love/not/nothing/maybe/yes');
  assert(!fires());
  touchFile('/aa/i/love/maybe');
  assert(fires());
  remove('/aa/i');
  remove('/aa/whatever');

  remove('/aa');
  touchFile('/aa/b');
  console.log("... nested directories");
  go({
    files: {'/aa/b': true },
    directories: {
      '/aa': {
        include: [/yes/, /maybe/, /aa/],
        exclude: [/not/, /never/]
      },
      '/aa/x': {
        include: [/kitten/],
        exclude: [/puppy/]
      }
    }
  });
  touchFile('/aa/kitten');
  assert(!fires());
  touchFile('/aa/maybe.puppy');
  assert(fires());
  remove('/aa/maybe.puppy');
  go();
  touchFile('/aa/x/kitten');
  assert(fires());
  remove('/aa/x/kitten');
  go();
  touchFile('/aa/x/yes');
  assert(!fires());
  touchFile('/aa/x/kitten.not');
  assert(fires());
  remove('/aa');

  console.log("... rapid changes to file");
  touchFile('/aa/x');
  waitForTopOfSecond();
  go({
    files: {'/aa/x': true }});
  touchFile('/aa/x');
  assert(fires(2000));
  go({
    directories: {
      '/aa': {
        include: [/yes/, /maybe/, /aa/],
        exclude: [/not/, /never/]
      }
    }
  });
  waitForTopOfSecond();
  touchFile('/aa/thing1/whatever');
  delay(100);
  touchFile('/aa/thing2/yes');
  assert(fires(2000));
  remove('/aa');

  console.log("... rapid changes to directory");
  touchDir('/aa');
  waitForTopOfSecond();
  go({
    directories: {'/aa': {
      include: [/yes/, /maybe/, /aa/],
      exclude: [/not/, /never/]
    }}
  });
  touchFile('/aa/x/yes');
  assert(fires(2000));
  remove('/aa/x');

  waitForTopOfSecond();
  go();
  delay(600);
  touchFile('/aa/x/not');
  delay(600);
  touchFile('/aa/x/yes');
  assert(fires(2000));
  remove('/aa/x');

  touchDir('/aa/x');
  go();
  delay(2000);
  waitForTopOfSecond();
  touchFile('/aa/x/no');
  delay(600);
  touchFile('/aa/x/yes');
  assert(fires(2000));

  console.log("Watcher test passed");
  theWatcher.stop();

}).run();


