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

const Fiber = require('fibers');

const filter = parseFloat(process.env.METEOR_PROFILE || "100"); // ms

type Stats = {
  time: number;
  count: number;
  isOther: boolean;
}

let bucketStats: Record<string, Stats> = Object.create(null);

let SPACES_STR = ' ';
// return a string of `x` spaces
function spaces(len: number) {
  while (SPACES_STR.length < len) {
    SPACES_STR = SPACES_STR + SPACES_STR;
  }
  return SPACES_STR.slice(0, len);
}

let DOTS_STR = '.';
// return a string of `x` dots
function dots(len: number) {
  while (DOTS_STR.length < len) {
    DOTS_STR = DOTS_STR + DOTS_STR;
  }
  return DOTS_STR.slice(0, len);
}

function leftRightAlign(str1: string, str2: string, len: number) {
  var middle = Math.max(1, len - str1.length - str2.length);
  return str1 + spaces(middle) + str2;
}

function leftRightDots(str1: string, str2: string, len: number) {
  var middle = Math.max(1, len - str1.length - str2.length);
  return str1 + dots(middle) + str2;
}

function printIndentation(isLastLeafStack: boolean[]) {
  if (!isLastLeafStack.length) {
    return '';
  }

  const { length } = isLastLeafStack;
  let init = '';
  for (let i = 0; i < length - 1; ++i) {
    const isLastLeaf = isLastLeafStack[i];
    init += isLastLeaf ? '   ' : '│  ';
  }

  const last = isLastLeafStack[length - 1] ? '└─ ' : '├─ ';

  return init + last;
}

function formatMs(n: number) {
  // integer with thousands separators
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " ms";
}

function encodeEntryKey(entry: string[]) {
  return entry.join('\t');
}

function decodeEntryKey(key: string) {
  return key.split('\t');
}

const globalEntry: string[] = [];
let running = false;

export function Profile<
  TArgs extends any[],
  TResult,
>(
  bucketName: string | ((...args: TArgs) => string),
  f: (...args: TArgs) => TResult,
): typeof f {
  if (! Profile.enabled) {
    return f;
  }

  return Object.assign(function profileWrapper(this: any) {
    if (! running) {
      return f.apply(this, arguments as any);
    }

    const name = typeof bucketName === "function"
      ? bucketName.apply(this, arguments as any)
      : bucketName;

    const currentEntry = Fiber.current
      ? Fiber.current.profilerEntry || (Fiber.current.profilerEntry = [])
      : globalEntry;

    currentEntry.push(name);
    const key = encodeEntryKey(currentEntry);
    const start = process.hrtime();
    try {
      return f.apply(this, arguments as any);
    } finally {
      const elapsed = process.hrtime(start);
      const stats = (bucketStats[key] || (bucketStats[key] = {
        time: 0.0,
        count: 0,
        isOther: false,
      }));
      stats.time += (elapsed[0] * 1000 + elapsed[1] / 1000000);
      stats.count++;
      currentEntry.pop();
    }
  }, f) as typeof f;
}

export namespace Profile {
  export let enabled = !! process.env.METEOR_PROFILE;

  export function time<TResult>(bucket: string, f: () => TResult) {
    return Profile(bucket, f)();
  }

  export function run<TResult>(bucket: string, f: () => TResult) {
    if (! Profile.enabled) {
      return f();
    }

    if (running) {
      // We've kept the calls to Profile.run in the tool disjoint so far,
      // and should probably keep doing so, but if we mess up, warn and continue.
      console.log("Warning: Nested Profile.run at " + bucket);
      return time(bucket, f);
    }

    runningName = bucket;
    print(`(#${reportNum}) Profiling: ${runningName}`);
    start();
    try {
      return time(bucket, f);
    } finally {
      report();
      reportNum++;
    }
  }

  function start() {
    bucketStats = {};
    running = true;
  }

  let runningName: string;
  let reportNum = 1;
  function report() {
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
  }
}

type Entry = string[];
let entries: Entry[] = [];

const prefix = "| ";

function entryName(entry: Entry) {
  return entry[entry.length - 1];
}

function entryStats(entry: Entry) {
  return bucketStats[encodeEntryKey(entry)];
}

function entryTime(entry: Entry) {
  return entryStats(entry).time;
}

function isTopLevelEntry(entry: Entry) {
  return entry.length === 1;
}

function topLevelEntries() {
  return entries.filter(isTopLevelEntry);
}

function print(text: string) {
  console.log(prefix + text);
}

function isChild(entry1: Entry, entry2: Entry) {
  if (entry2.length !== entry1.length + 1) {
    return false;
  }
  for (var i = entry1.length - 1; i >= 0; i--) {
    if (entry1[i] !== entry2[i]) {
      return false;
    }
  }
  return true;
}

function children(entry1: Entry) {
  return entries.filter(entry2 => isChild(entry1, entry2));
}

function hasChildren(entry: Entry) {
  return children(entry).length > 0;
}

function hasSignificantChildren(entry: Entry) {
  return children(entry).some(entry => entryTime(entry) >= filter);
}

function isLeaf(entry: Entry) {
  return ! hasChildren(entry);
}

function otherTime(entry: Entry) {
  let total = 0;
  children(entry).forEach(child => {
    total += entryTime(child);
  });
  return entryTime(entry) - total;
}

function injectOtherTime(entry: Entry) {
  const other: Entry = entry.slice(0);
  other.push("other " + entryName(entry));
  bucketStats[encodeEntryKey(other)] = {
    time: otherTime(entry),
    count: entryStats(entry).count,
    isOther: true
  };
  entries.push(other);
};

function reportOn(entry: Entry, isLastLeafStack: boolean[] = []) {
  const stats = entryStats(entry);
  const isParent = hasSignificantChildren(entry);
  const name = entryName(entry);

  print((isParent ? leftRightDots : leftRightAlign)
        (printIndentation(isLastLeafStack) + name, formatMs(stats.time), 70)
        + (stats.isOther ? "" : (" (" + stats.count + ")")));

  if (isParent) {
    const childrenList = children(entry).filter(entry => {
      return entryStats(entry).time > filter;
    });
    childrenList.forEach((child, i) => {
      const isLastLeaf = i === childrenList.length - 1;
      reportOn(child, isLastLeafStack.concat(isLastLeaf));
    });
  }
}

function reportHierarchy() {
  topLevelEntries().forEach(entry => reportOn(entry));
}

function allLeafs() {
  const set: { [name: string]: any } = Object.create(null);
  entries.filter(isLeaf).map(entryName).forEach(name => set[name] = true);
  return Object.keys(set).sort();
}

function leafTotals(leafName: string) {
  let time = 0;
  let count = 0;

  entries.filter(entry => {
    return entryName(entry) === leafName && isLeaf(entry);
  }).forEach(leaf => {
    const stats = entryStats(leaf);
    time += stats.time;
    count += stats.count;
  });

  return { time, count };
}

function reportHotLeaves() {
  print('Top leaves:');

  const totals = allLeafs().map(leaf => {
    const info = leafTotals(leaf);
    return {
      name: leaf,
      time: info.time,
      count: info.count,
    };
  }).sort((a, b) => {
    return a.time === b.time ? 0 : a.time > b.time ? -1 : 1;
  });

  totals.forEach(total => {
    if (total.time < 100) { // hard-coded larger filter to quality as "hot" here
      return;
    }
    print(leftRightDots(total.name, formatMs(total.time), 65) + ` (${total.count})`);
  });
}

function getTopLevelTotal() {
  let topTotal = 0;
  topLevelEntries().forEach(entry => {
    topTotal += entryTime(entry);
  });
  return topTotal;
}

function setupReport() {
  entries = Object.keys(bucketStats).map(decodeEntryKey);
  entries.filter(hasSignificantChildren).forEach(parent => {
    injectOtherTime(parent);
  });
}
