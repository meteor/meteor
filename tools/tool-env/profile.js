// Tiny profiler
//
// Enable by setting the environment variable `METEOR_PROFILE`.
//
// The main entry point is `Profile`, which wraps an existing function
// and returns a new function which, when called, calls the original
// function and profiles it.
//
// before:
//
//     foo: function (a) {
//       return a + this.b;
//     },
//
// after:
//
//     foo: Profile("foo", function (a) {
//       return a + this.b;
//     }),
//
// The advantage of this form is that it doesn't change the
// indentation of the wrapped code, which makes merging changes from
// other code branches easier.
//
// If profiling is disabled (if `METEOR_PROFILE` isn't set), `Profile`
// simply returns the original function.
//
// To run a profiling session and print the report, call `Profile.run`:
//
//     var createBundle = function () {
//       Profile.run("bundle", function () {
//         ...code to create the bundle which includes calls to `Profile`.
//       });
//     };
//
// Code is not profiled when called outside of a `Profile.run`, so the
// times in the report only include the time spent inside of the call
// to `Profile.run`.
//
// Sometimes you'll want to use a name for the profile bucket which
// depends on the arguments passed to the function or the value of
// `this`.  In this case you can pass a function for the bucket
// argument, which will be called to get the bucket name.
//
// before:
//     build: function (target) {
//       ... build target ...
//     },
//
// after:
//     build: Profile(
//       function (target) { return "build " + target; },
//       function (target) {
//         ... build target ...
//       }),
//
// But if it's easier, you can use `Profile.time` instead, which
// immediately calls the passed function with no arguments and
// profiles it, and returns what the function returns.
//
//     foo: function (a) {
//       var self = this;
//       return Profile.time("foo", function () {
//         return a + self.b;
//       });
//     },
//
//     build: function (target) {
//       var self = this;
//       self.doSomeSetup();
//       Profile.time("build " + target, function () {
//         ... build target ...
//       });
//       self.doSomeCleanup();
//     },
//
// The disadvantage is that you end up changing the indentation of the
// profiled code, which makes merging branches more painful.  But you
// can profile anywhere in the code; you don't have to just profile at
// function boundaries.
//
// Note profiling code will itself add a bit of execution time.
// If you profile in a tight loop and your total execution time is
// going up, you're probably starting to profile how long it takes to
// profile things :).
//
// If another profile (such as "compile js") is called while the first
// function is currently being profiled, this creates an entry like
// this:
//
//    build client : compile js
//
// which can continue to be nested, e.g.,
//
//    build client : compile js : read source files
//
// The total time reported for a bucket such as "build client" doesn't
// change regardless of whether it has child entries or not.  However,
// if an entry has child entries, it automatically gets an "other"
// entry:
//
//     build client: 400.0
//       compile js: 300.0
//         read source files: 20.0
//         other compile js: 280.0
//       other build client: 100.0
//
// The "other" entry reports how much time was spent in the "build
// client" entry not spent in the other child entries.
//
// The are two reports displayed: the hierarchical report and the
// leaf time report.  The hierarchical report looks like the example
// above and shows how much time was spent in each entry within its
// parent entry.
//
// The primary purpose of the hierarchical report is to be able to see
// where times are unaccounted for.  If you see a lot of time being
// spent in an "other" bucket, and you don't know what it is, you can
// add more profiling to dig deeper.
//
// The leaf time report shows the total time spent within leaf
// buckets.  For example, if if multiple steps have "read source
// files", the leaf time reports shows the total amount of time spent
// in "read source files" across all calls.
//
// Once you see in the hierarchical report that you have a good handle
// on accounting for most of the time, the leaf report shows you which
// buckets are the most expensive.
//
// By only including leaf buckets, the times in the leaf report are
// non-overlapping.  (The total of the times equals the elapsed time
// being profiled).
//
// For example, suppose "A" is profiled for a total time of 200ms, and
// that includes a call to "B" of 150ms:
//
//     B: 150
//     A (without B): 50
//
// and suppose there's another call to "A" which *doesn't* include a
// call to "B":
//
//     A: 300
//
// and there's a call to "B" directly:
//
//     B: 100
//
// All for a total time of 600ms.  In the hierarchical report, this
// looks like:
//
//     A: 500.0
//       B: 150.0
//       other A: 350.0
//     B: 100.0
//
// and in the leaf time report:
//
//     other A: 350.0
//     B: 250.0
//
// In both reports the grand total is 600ms.

var _ = require('underscore');
var Fiber = require('fibers');

Profile.enabled = !! process.env['METEOR_PROFILE'];
var filter = parseFloat(process.env['METEOR_PROFILE']); // ms
if (isNaN(filter)) {
  filter = 100; // ms
}

var bucketStats = {};

var SPACES_STR = ' ';
// return a string of `x` spaces
var spaces = function (x) {
  while (SPACES_STR.length < x) {
    SPACES_STR = SPACES_STR + SPACES_STR;
  }
  return SPACES_STR.slice(0, x);
};

var DOTS_STR = '.';
// return a string of `x` dots
var dots = function (x) {
  while (DOTS_STR.length < x) {
    DOTS_STR = DOTS_STR + DOTS_STR;
  }
  return DOTS_STR.slice(0, x);
};


var leftAlign = function (str, len) {
  if (str.length < len) {
    str = str + spaces(len - str.length);
  }
  return str;
};

var rightAlign = function (str, len) {
  if (str.length < len) {
    str = spaces(len - str.length) + str;
  }
  return str;
};

var leftRightAlign = function (str1, str2, len) {
  var middle = Math.max(1, len - str1.length - str2.length);
  return str1 + spaces(middle) + str2;
};

var leftRightDots = function (str1, str2, len) {
  var middle = Math.max(1, len - str1.length - str2.length);
  return str1 + dots(middle) + str2;
};

var printIndentation = function (isLastLeafStack) {
  if (_.isEmpty(isLastLeafStack)) {
    return '';
  }

  var init = _.map(_.initial(isLastLeafStack), function(isLastLeaf) {
    return isLastLeaf ? '   ' : '│  ';
  }).join('');
  var last = _.last(isLastLeafStack) ? '└─ ' : '├─ ';
  return init + last;
};

var formatMs = function (n) {
  // integer with thousands separators
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " ms";
};

var encodeEntryKey = function (entry) {
  return entry.join('\t');
};

var decodeEntryKey = function (key) {
  return key.split('\t');
};

var globalEntry = [];

var running = false;
var runningName;

var start = function () {
  bucketStats = {};
  running = true;
};

function Profile(bucketName, f) {
  if (! Profile.enabled) {
    return f;
  }

  return Object.assign(function profileWrapper() {
    if (! running) {
      return f.apply(this, arguments);
    }

    var name;
    if (_.isFunction(bucketName)) {
      name = bucketName.apply(this, arguments);
    } else {
      name = bucketName;
    }

    var currentEntry;
    if (Fiber.current) {
      currentEntry =
        Fiber.current.profilerEntry || (Fiber.current.profilerEntry = []);
    } else {
      currentEntry = globalEntry;
    }

    currentEntry.push(name);
    var key = encodeEntryKey(currentEntry);
    var start = process.hrtime();
    var err = null;
    try {
      return f.apply(this, arguments);
    }
    catch (e) {
      err = e;
    }
    finally {
      var elapsed = process.hrtime(start);
      var stats = (bucketStats[key] || (bucketStats[key] = {
        time: 0.0, count: 0
      }));
      stats.time += (elapsed[0] * 1000 + elapsed[1] / 1000000);
      stats.count++;
      currentEntry.pop();
    }

    if (err) {
      throw err;
    }
  }, f);
}

var time = function (bucket, f) {
  return Profile(bucket, f)();
};

var entries = null;

var prefix = "| ";

var entryName = function (entry) {
  return _.last(entry);
};

var entryStats = function (entry) {
  return bucketStats[encodeEntryKey(entry)];
};

var entryTime = function (entry) {
  return entryStats(entry).time;
};

var isTopLevelEntry = function (entry) {
  return entry.length === 1;
};

var topLevelEntries = function () {
  return _.filter(entries, isTopLevelEntry);
};

var print = function (text) {
  console.log(prefix + text);
};

var isChild = function (entry1, entry2) {
  if (entry2.length !== entry1.length + 1) {
    return false;
  }
  for (var i = entry1.length-1; i >= 0; i--) {
    if (entry1[i] !== entry2[i]) {
      return false;
    }
  }

  return true;
};

var children = function (entry1) {
  return _.filter(entries, function (entry2) {
    return isChild(entry1, entry2);
  });
}

var hasChildren = function (entry) {
  return children(entry).length !== 0;
};

var hasSignificantChildren = function (entry) {
  return _.some(children(entry), function (entry) {
    return (entryTime(entry) >= filter);
  });
};

var isLeaf = function (entry) {
  return ! hasChildren(entry);
};

var otherTime = function (entry) {
  var total = 0;
  _.each(children(entry), function (child) {
    total += entryTime(child);
  });
  return entryTime(entry) - total;
};

var injectOtherTime = function (entry) {
  var name = "other " + entryName(entry);
  var other = _.clone(entry);
  other.push(name);
  bucketStats[encodeEntryKey(other)] = {
    time: otherTime(entry),
    count: entryStats(entry).count,
    isOther: true
  };
  entries.push(other);
};

var reportOn = function (entry, isLastLeafStack) {
  isLastLeafStack = isLastLeafStack || [];
  var stats = entryStats(entry);
  var isParent = hasSignificantChildren(entry);
  var name = entryName(entry);
  print((isParent ? leftRightDots : leftRightAlign)
        (printIndentation(isLastLeafStack) + name, formatMs(stats.time), 70)
        + (stats.isOther ? "" : (" (" + stats.count + ")")));

  if (isParent) {
    var childrenList = _.filter(children(entry), function(entry) {
      var stats = entryStats(entry);
      return stats.time > filter;
    });
    _.each(childrenList, function (child, i) {
      var isLastLeaf = i === childrenList.length - 1;
      reportOn(child, isLastLeafStack.concat(isLastLeaf));
    });
  }
};

var reportHierarchy = function () {
  _.each(topLevelEntries(), function (entry) {
    reportOn(entry);
  });
};

var allLeafs = function () {
  return _.union(_.map(_.filter(entries, isLeaf), entryName));
};

var leafTotals = function (leafName) {
  var time = 0;
  var count = 0;
  _.each(
    _.filter(entries, function (entry) {
      return entryName(entry) === leafName && isLeaf(entry);
    }),
    function (leaf) {
      var stats = entryStats(leaf);
      time += stats.time;
      count += stats.count;
    }
  );
  return {time, count};
};

var reportHotLeaves = function () {
  print('Top leaves:');
  var totals = [];
  _.each(allLeafs(), function (leaf) {
    var info = leafTotals(leaf);
    totals.push({name: leaf, time: info.time, count: info.count});
  });
  totals.sort(function (a, b) {
    return a.time === b.time ? 0 : a.time > b.time ? -1 : 1;
  });
  _.each(totals, function (total) {
    if (total.time < 100) { // hard-coded larger filter to quality as "hot" here
      return;
    }
    print(leftRightDots(total.name, formatMs(total.time), 65) +
          ` (${total.count})`);
  });
};

var getTopLevelTotal = function () {
  var topTotal = 0;
  _.each(topLevelEntries(), function (entry) {
    topTotal += entryTime(entry);
  });
  return topTotal;
};

var setupReport = function () {
  entries = _.map(_.keys(bucketStats), decodeEntryKey);
  _.each(_.filter(entries, hasSignificantChildren), function (parent) {
    injectOtherTime(parent);
  });
};

var reportNum = 1;

var report = function () {
  if (! Profile.enabled) {
    return;
  }
  running = false;
  print('');
  setupReport();
  reportHierarchy();
  print('');
  reportHotLeaves();
  print('');
  print(`(#${reportNum}) Total: ${formatMs(getTopLevelTotal())}` +
        ` (${runningName})`);
  print('');
};

var run = function (bucketName, f) {
  if (! Profile.enabled) {
    return f();
  } else if (running) {
    // We've kept the calls to Profile.run in the tool disjoint so far,
    // and should probably keep doing so, but if we mess up, warn and continue.
    console.log("Warning: Nested Profile.run at " + bucketName);
    return time(bucketName, f);
  } else {
    runningName = bucketName;
    print(`(#${reportNum}) Profiling: ${runningName}`);
    start();
    try {
      return time(bucketName, f);
    }
    finally {
      report();
      reportNum++;
    }
  }
};

Profile.time = time;
Profile.run = run;

exports.Profile = Profile;
