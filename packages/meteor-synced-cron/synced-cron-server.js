// A package for running jobs synchronized across multiple processes
SyncedCron = {
  _entries: {},
  running: false,
  options: {
    //Log job run details to console
    log: true,

    logger: null,

    //Name of collection to use for synchronisation and logging
    collectionName: "cronHistory",

    //Default to using localTime
    utc: false,

    //TTL in seconds for history records in collection to expire
    //NOTE: Unset to remove expiry but ensure you remove the index from
    //mongo by hand
    collectionTTL: 172800,
  },
  config: function (opts) {
    this.options = Object.assign({}, this.options, opts);
  },
};

Later = Npm.require("@breejs/later");

/*
  Logger factory function. Takes a prefix string and options object
  and uses an injected `logger` if provided, else falls back to
  Meteor's `Log` package.

  Will send a log object to the injected logger, on the following form:

    message: String
    level: String (info, warn, error, debug)
    tag: 'SyncedCron'
*/
function createLogger(prefix) {
  check(prefix, String);

  // Return noop if logging is disabled.
  if (SyncedCron.options.log === false) {
    return function () {};
  }

  return function (level, message) {
    check(level, Match.OneOf("info", "error", "warn", "debug"));
    check(message, String);

    const logger = SyncedCron.options && SyncedCron.options.logger;

    if (logger && typeof logger === "function") {
      logger({
        level: level,
        message: message,
        tag: prefix,
      });
    } else {
      Log[level]({ message: prefix + ": " + message });
    }
  };
}

let log;

const partial = (func, ...boundArgs) => (...remainingArgs) => func(...boundArgs, ...remainingArgs)

Meteor.startup(async function syncedCronStartup() {
  const options = SyncedCron.options;

  log = createLogger("SyncedCron");

  ["info", "warn", "error", "debug"].forEach(function (level) {
    log[level] = partial(log, level);
  });

  // Don't allow TTL less than 5 minutes so we don't break synchronization
  const minTTL = 300;

  // Use UTC or localtime for evaluating schedules
  if (options.utc) Later.date.UTC();
  else Later.date.localTime();

  // collection holding the job history records
  SyncedCron._collection = new Mongo.Collection(options.collectionName);
  await SyncedCron._collection.createIndexAsync(
    { intendedAt: 1, name: 1 },
    { unique: true },
  );

  if (options.collectionTTL) {
    if (options.collectionTTL > minTTL)
      await SyncedCron._collection.createIndexAsync(
        { startedAt: 1 },
        { expireAfterSeconds: options.collectionTTL },
      );
    else log.warn("Not going to use a TTL that is shorter than:" + minTTL);
  }
});

const scheduleEntry = function (entry) {
  const schedule = entry.schedule(Later.parse);
  entry._timer = SyncedCron._laterSetInterval(
    SyncedCron._entryWrapper(entry),
    schedule,
  );

  log.info(
    'Scheduled "' +
      entry.name +
      '" next run @' +
      Later.schedule(schedule).next(1),
  );
};

// add a scheduled job
// SyncedCron.add({
//   name: String, //*required* unique name of the job
//   schedule: function(laterParser) {},//*required* when to run the job
//   job: function() {}, //*required* the code to run
// });
SyncedCron.add = function (entry) {
  check(entry.name, String);
  check(entry.schedule, Function);
  check(entry.job, Function);
  check(entry.persist, Match.Optional(Boolean));

  if (entry.persist === undefined) {
    entry.persist = true;
  }

  // check
  if (!this._entries[entry.name]) {
    this._entries[entry.name] = entry;

    // If cron is already running, start directly.
    if (this.running) {
      scheduleEntry(entry);
    }
  }
};

// Start processing added jobs
SyncedCron.start = function () {
  const self = this;

  Meteor.startup(function () {
    // Schedule each job with later.js
    Object.values(self._entries).forEach(function scheduleEachEntry(entry) {
      scheduleEntry(entry);
    });
    self.running = true;
  });
};

// Return the next scheduled date of the first matching entry or undefined
SyncedCron.nextScheduledAtDate = function (jobName) {
  const entry = this._entries[jobName];

  if (entry) return Later.schedule(entry.schedule(Later.parse)).next(1);
};

// Remove and stop the entry referenced by jobName
SyncedCron.remove = function (jobName) {
  const entry = this._entries[jobName];

  if (entry) {
    if (entry._timer) entry._timer.clear();

    delete this._entries[jobName];
    log.info('Removed "' + entry.name + '"');
  }
};

// Pause processing, but do not remove jobs so that the start method will
// restart existing jobs
SyncedCron.pause = function () {
  if (this.running) {
    Object.values(this._entries).forEach(function pauseEntry(entry) {
      entry._timer.clear();
    });
    this.running = false;
  }
};

// Stop processing and remove ALL jobs
SyncedCron.stop = function () {
  Object.values(this._entries).forEach(function stopEntry(entry) {
    SyncedCron.remove(entry.name);
  });
  this.running = false;
};

// The meat of our logic. Checks if the specified has already run. If not,
// records that it's running the job, runs it, and records the output
SyncedCron._entryWrapper = function (entry) {
  const self = this;

  return async function syncedCronRun(intendedAt) {
    intendedAt = new Date(intendedAt.getTime());
    intendedAt.setMilliseconds(0);

    let jobHistory;

    if (entry.persist) {
      jobHistory = {
        intendedAt: intendedAt,
        name: entry.name,
        startedAt: new Date(),
      };

      // If we have a dup key error, another instance has already tried to run
      // this job.
      try {
        jobHistory._id = await self._collection.insertAsync(jobHistory);
      } catch (e) {
        // http://www.mongodb.org/about/contributors/error-codes/
        // 11000 == duplicate key error
        if (e.code === 11000) {
          log.info('Not running "' + entry.name + '" again.');
          return;
        }

        throw e;
      }
    }

    // run and record the job
    try {
      log.info('Starting "' + entry.name + '".');
      const output = entry.job(intendedAt, entry.name); // <- Run the actual job

      log.info('Finished "' + entry.name + '".');
      if (entry.persist) {
        await self._collection.updateAsync(
          { _id: jobHistory._id },
          {
            $set: {
              finishedAt: new Date(),
              result: output,
            },
          },
        );
      }
    } catch (e) {
      log.info(
        'Exception "' + entry.name + '" ' + (e && e.stack ? e.stack : e),
      );
      if (entry.persist) {
        await self._collection.updateAsync(
          { _id: jobHistory._id },
          {
            $set: {
              finishedAt: new Date(),
              error: e && e.stack ? e.stack : e,
            },
          },
        );
      }
    }
  };
};

// for tests
SyncedCron._reset = async function () {
  this._entries = {};
  await this._collection.removeAsync({});
  this.running = false;
};

// ---------------------------------------------------------------------------
// The following two functions are lifted from the later.js package, however
// I've made the following changes:
// - Use Meteor.setTimeout and Meteor.clearTimeout
// - Added an 'intendedAt' parameter to the callback fn that specifies the precise
//   time the callback function *should* be run (so we can co-ordinate jobs)
//   between multiple, potentially laggy and unsynced machines

// From: https://github.com/bunkat/later/blob/master/src/core/setinterval.js
SyncedCron._laterSetInterval = function (fn, sched) {
  let t = SyncedCron._laterSetTimeout(scheduleTimeout, sched),
    done = false;

  /**
   * Executes the specified function and then sets the timeout for the next
   * interval.
   */
  async function scheduleTimeout(intendedAt) {
    if (!done) {
      try {
        await fn(intendedAt);
      } catch (e) {
        log.info(
          "Exception running scheduled job " + (e && e.stack ? e.stack : e),
        );
      }

      t = SyncedCron._laterSetTimeout(scheduleTimeout, sched);
    }
  }

  return {
    /**
     * Clears the timeout.
     */
    clear: function () {
      done = true;
      t.clear();
    },
  };
};

// From: https://github.com/bunkat/later/blob/master/src/core/settimeout.js
SyncedCron._laterSetTimeout = function (fn, sched) {
  const s = Later.schedule(sched);
  let t;
  scheduleTimeout();

  /**
   * Schedules the timeout to occur. If the next occurrence is greater than the
   * max supported delay (2147483647 ms) than we delay for that amount before
   * attempting to schedule the timeout again.
   */
  function scheduleTimeout() {
    const now = Date.now();
    const next = s.next(2, now);

    // don't schedlue another occurence if no more exist synced-cron#41
    if (!next[0]) return;

    let diff = next[0].getTime() - now;
    let intendedAt = next[0];

    // minimum time to fire is one second, use next occurrence instead
    if (diff < 1000) {
      diff = next[1].getTime() - now;
      intendedAt = next[1];
    }

    if (diff < 2147483647) {
      t = Meteor.setTimeout(async function () {
        await fn(intendedAt);
      }, diff);
    } else {
      t = Meteor.setTimeout(scheduleTimeout, 2147483647);
    }
  }

  return {
    /**
     * Clears the timeout.
     */
    clear: function () {
      Meteor.clearTimeout(t);
    },
  };
};
// ---------------------------------------------------------------------------
