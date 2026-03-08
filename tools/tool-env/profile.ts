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
// and in the leaf report:
//
//     other A: 350.0
//     B: 250.0
//
// In both reports the grand total is 600ms.

// Profiler Usage Documentation
/**
* To use the Meteor profiler:
* 
* 1. For basic profiling:
* METEOR_PROFILE=1 meteor <command>
* 
* 2. For profiling with inspector (generating .cpuprofile files):
* METEOR_INSPECT=bundler.bundle,<other_function_names> meteor <command>
* 
* 3. Additional settings:
* METEOR_INSPECT_CONTEXT=context_name (identification for files)
* METEOR_INSPECT_OUTPUT=path/to/directory (location where to save files)
* 
* 4. To view .cpuprofile files:
* - Open Chrome DevTools
* - Go to the "Performance" or "Profiler" tab
* - Click "Load Profile" and select the .cpuprofile file
*/

import * as inspector from 'inspector';
import * as fs from 'fs';
import * as path from 'path';

interface MeteorAsyncLocalStorage {
  getStore: () => ProfileStore | undefined;
  run: <T>(store: ProfileStore, fn: () => T) => T;
}

interface ProfileStore {
  currentEntry: string[];
  [key: string]: any;
}

declare global {
  var __METEOR_ASYNC_LOCAL_STORAGE: MeteorAsyncLocalStorage;
}

interface InspectorConfigType {
  enabled: boolean;
  filter: string[];
  context: string;
  outputDir: string;
  samplingInterval: number | undefined;
  maxProfileSize: number;
}

const INSPECTOR_CONFIG: InspectorConfigType = {
  enabled: !!process.env.METEOR_INSPECT,
  filter: process.env.METEOR_INSPECT ? process.env.METEOR_INSPECT.split(',') : [],
  context: process.env.METEOR_INSPECT_CONTEXT || '',
  outputDir: process.env.METEOR_INSPECT_OUTPUT || path.join(process.cwd(), 'profiling'),
  // Interval in ms (smaller = more details, but more memory)
  samplingInterval: process.env.METEOR_INSPECT_INTERVAL ? parseInt(process.env.METEOR_INSPECT_INTERVAL || '1000', 10) : undefined,
  maxProfileSize: parseInt(process.env.METEOR_INSPECT_MAX_SIZE || '2000', 10)
};

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

let running = false;

export function Profile<
  TArgs extends any[],
  TResult,
>(
  bucketName: string | ((...args: TArgs) => string),
  f: (...args: TArgs) => TResult | Promise<TResult>,
): typeof f {
  if (!Profile.enabled) {
    return f;
  }

  return Object.assign(function profileWrapper(this: any) {
    const args = Array.from(arguments) as TArgs;

    if (!running) {
      return f.apply(this, args);
    }

    const asyncLocalStorage = global.__METEOR_ASYNC_LOCAL_STORAGE;
    let store = asyncLocalStorage.getStore() || { currentEntry: [] };

    const name = typeof bucketName === 'function' ? bucketName.apply(this, args) : bucketName;
    
    // callbacks with observer to track when the function finishes
    const profileInfo = {
      name,
      isActive: false,
      isCompleted: false,
      startTime: Date.now()
    };

    if (shouldRunInspectorProfiling(name)) {
      profileInfo.isActive = startInspectorProfiling(name);
      
      if (profileInfo.isActive) {
        const handleTermination = (context: string) => {
          if (profileInfo.isActive && !profileInfo.isCompleted) {
            return stopInspectorProfiling(name, true).catch(err => {
              process.stdout.write(`[PROFILING_${context}] Error stopping profiling: ${err}\n`);
            });
          }
          return Promise.resolve();
        };

        process.on('exit', () => { handleTermination('EXIT'); });

        const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
        signals.forEach(signal => {
          process.once(signal, () => {
            handleTermination('SIGNAL').finally(() => {
              process.exit(130);
            });
          });
        });
      }
    }

    const completeProfiler = () => {
      if (profileInfo.isActive && !profileInfo.isCompleted) {
        profileInfo.isCompleted = true;
        return stopInspectorProfiling(name, true).catch(err => {
          process.stdout.write(`[PROFILING_COMPLETE] Error stopping profiling: ${err}`);
        });
      }
      return Promise.resolve();
    };

    function completeIfSync(result:  TResult | Promise<TResult>){
      if (!(result instanceof Promise)) {
        completeProfiler();
      }
    }

    try {
      if (!asyncLocalStorage.getStore()) {
        const result = asyncLocalStorage.run(store, () => 
          runWithContext(name, store, f, this, args, completeProfiler));
          
        // For sync results, complete profiling here
        completeIfSync(result)
        return result;
      }

      // if there is already a store, use the current context
      const result = runWithContext(name, store, f, this, args, completeProfiler);
      
      // For sync results, complete profiling here
      completeIfSync(result)
      return result;
    } catch (error) {
      completeProfiler();
      throw error;
    }
  }, f) as typeof f;
}

// ================================
// Inspector Profiling
// ================================
let inspectorActive = false;
let rootSession: inspector.Session | null = null;
let rootProfileName: string | null = null;
let profileStartTime: number | null = null;

function shouldRunInspectorProfiling(name: string): boolean {
  if (!INSPECTOR_CONFIG.enabled) return false;
  return INSPECTOR_CONFIG.filter.includes(name);
}

function startInspectorProfiling(name: string): boolean {
  if (!shouldRunInspectorProfiling(name)) {
    return false;
  }

  try {
    if (rootSession) {
      return false;
    }
    
    profileStartTime = Date.now();
    
    // Open the inspector only if it's not active
    if (!inspectorActive) {
      inspector.open();
      inspectorActive = true;
    }
    
    // Create a single session for the duration of profiling
    const session = new inspector.Session();
    session.connect();
    session.post('Profiler.enable');
    session.post('Profiler.start', {
      samplingInterval: INSPECTOR_CONFIG.samplingInterval
    });

    // Store the root session for later use
    rootSession = session;
    rootProfileName = name;
    
    return true;
  } catch (err) {
    process.stdout.write(`[PROFILING_START] Error starting profiling for ${name}: ${err}\n`);
    return false;
  }
}

function stopInspectorProfiling(name: string, isActive: boolean): Promise<void> {
  if (!isActive || !rootSession || name !== rootProfileName) {
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    try {
      const duration = profileStartTime ? Date.now() - profileStartTime : 0;
      const session = rootSession;
      if (!session) {
        return resolve();
      }
      
      session.post('Profiler.stop', (err: Error | null, result: any) => {
        if (err) {
          cleanupAndResolve(resolve);
          reject(err);
          return;
        }
        
        try {
          // check if we have data in the profile
          if (!result || !result.profile) {
            console.error(`[PROFILING_STOP] Empty profile for ${name}`);
            cleanupAndResolve(resolve);
            return;
          }
          
          // check the approximate size of the profile
          const profileStr = JSON.stringify(result.profile);
          const profileSize = profileStr.length / (1024 * 1024); // in MB
          
          process.stdout.write(`[PROFILING_STOP] Profile captured successfully for ${name}: ${JSON.stringify({
            nodes: result.profile.nodes?.length || 0,
            samples: result.profile.samples?.length || 0,
            timeDeltas: result.profile.timeDeltas?.length || 0,
            duration: duration,
            size: profileSize.toFixed(2) + " MB"
          })}`);
          
          if (profileSize > INSPECTOR_CONFIG.maxProfileSize) {
            process.stdout.write(`[PROFILING_STOP] Profile too large (${profileSize.toFixed(2)}MB > ${INSPECTOR_CONFIG.maxProfileSize}MB)`);
            process.stdout.write('[PROFILING_STOP] To avoid OOM, a reduced profile will be saved');
            process.stdout.write('[PROFILING_STOP] Increase METEOR_INSPECT_MAX_SIZE or METEOR_INSPECT_INTERVAL to adjust');
            
            // Try to save a reduced profile
            try {
              // Simplify the profile to reduce size
              const reducedProfile = {
                nodes: result.profile.nodes?.slice(0, 10000) || [],
                samples: result.profile.samples?.slice(0, 10000) || [],
                timeDeltas: result.profile.timeDeltas?.slice(0, 10000) || [],
                startTime: result.profile.startTime,
                endTime: result.profile.endTime,
                _warning: "profile truncated to avoid OOM. Use a larger interval."
              };
              
              saveProfile(reducedProfile, name, `${name}_reduced`, duration);
            } catch (reduceErr) {
              process.stdout.write(`[PROFILING_STOP] Error saving reduced profile: ${reduceErr}`);
            }
            
            cleanupAndResolve(resolve);
            return;
          }
          
          try {
            saveProfile(result.profile, name, name, duration);
          } catch (saveErr) {
            process.stdout.write(`[PROFILING_STOP] Error saving profile: ${saveErr}`);
          }
          
          cleanupAndResolve(resolve);
        } catch (processErr) {
          process.stdout.write(`[PROFILING_STOP] Error processing profile for ${name}: ${processErr}`);
          cleanupAndResolve(resolve);
          reject(processErr);
        }
      });
    } catch (err) {
      process.stdout.write(`[PROFILING_STOP] Error in stopInspectorProfiling for ${name}: ${err}`);
      cleanupAndResolve(resolve);
      reject(err);
    }
  });
  
  function cleanupAndResolve(resolve: (value?: void | PromiseLike<void>) => void) {
    try {
      if (rootSession) {
        rootSession.post('Profiler.disable');
        rootSession.disconnect();
      }
      
      if (inspectorActive) {
        inspector.close();
        inspectorActive = false;
      }
      
      rootSession = null;
      rootProfileName = null;
      profileStartTime = null;
      
      // Force GC if available
      if (typeof global.gc === 'function') {
        try {
          global.gc();
          process.stdout.write('[PROFILING_STOP] Garbage collector executed successfully');
        } catch (gcErr) {
          process.stdout.write(`[PROFILING_STOP] Error executing garbage collector: ${gcErr}`);
        }
      }
      
      return resolve();
    } catch (cleanupErr) {
      process.stdout.write(`[PROFILING_STOP] Error during cleanup: ${cleanupErr}`);
      return resolve();
    }
  }
}

function saveProfile(profile: any, name: string, filename: string, duration: number): void {
  if (!fs.existsSync(INSPECTOR_CONFIG.outputDir)) {
    fs.mkdirSync(INSPECTOR_CONFIG.outputDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeFilename = filename.replace(/[\/\\:]/g, '_');
  const filepath = path.join(INSPECTOR_CONFIG.outputDir, `${safeFilename}-${INSPECTOR_CONFIG.context}-${timestamp}.cpuprofile`);
  
  fs.writeFileSync(filepath, JSON.stringify(profile));
  
  const profileSize = JSON.stringify(profile).length / (1024 * 1024);
  
  process.stdout.write(`[PROFILING_SAVE] Profile for ${name} saved in: ${filepath}`);
  process.stdout.write(`[PROFILING_SAVE] Duration: ${duration}ms, size: ${profileSize.toFixed(2)}MB`);
}

function runWithContext<TArgs extends any[], TResult>(
    bucketName: string | ((...args: TArgs) => string),
    store: { currentEntry: string[]; [key: string]: any },
    f: (...args: TArgs) => TResult | Promise<TResult>,
    context: any,
    args: any[],
    completeProfiler: () => Promise<void>
): TResult | Promise<TResult> {
  const name = typeof bucketName === "function" ? bucketName.apply(context, args as TArgs) : bucketName;
  store.currentEntry = [...store.currentEntry || [], name];
  const key = encodeEntryKey(store.currentEntry);
  const start = process.hrtime();

  let result: TResult | Promise<TResult>;
  try {
    result = f.apply(context, args as TArgs);

    if (result instanceof Promise) {
      // Return a promise if async
      return result.finally(() => finalizeProfiling(key, start, store.currentEntry, completeProfiler));
    }

    // Return directly if sync
    return result;
  } finally {
    if (!(result! instanceof Promise)) {
      finalizeProfiling(key, start, store.currentEntry, completeProfiler);
    }
  }
}

function finalizeProfiling(key: string, start: [number, number], currentEntry: string[], completeProfiler: () => Promise<void>) {
  const elapsed = process.hrtime(start);
  const stats = (bucketStats[key] || (bucketStats[key] = {
    time: 0.0,
    count: 0,
    isOther: false,
  }));
  stats.time += elapsed[0] * 1000 + elapsed[1] / 1_000_000;
  stats.count++;
  currentEntry.pop();
  completeProfiler();
}

export namespace Profile {
  export let enabled = !! process.env.METEOR_PROFILE || !! process.env.METEOR_INSPECT;

  async function _runAsync<TResult>(bucket: string, f: () => TResult) {
    runningName = bucket;
    print(`(#${reportNum}) Profiling: ${runningName}`);
    start();
    try {
      return await time(bucket, f);
    } finally {
      report();
      reportNum++;
    }
  }

  function _runSync<TResult>(bucket: string, f: () => TResult) {
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

    const isAsyncFn = f.constructor.name === "AsyncFunction";
    if (!isAsyncFn) {
      return _runSync(bucket, f);
    }

    return _runAsync(bucket, f);
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

