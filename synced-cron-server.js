// A package for running jobs synchronized across multiple processes
SyncedCron = {
  _entries: [],
}

Later = Npm.require('later');

// collection holding the job history records
SyncedCron._collection = new Meteor.Collection('cronHistory');
SyncedCron._collection._ensureIndex({intendedAt: 1, name: 1}, {unique: true});


// add a scheduled job
// SyncedCron.add({
//   name: String, //*required* unique name of the job
//   schedule: function(laterParser) {},//*required* when to run the job
//   job: function() {}, //*required* the code to run
// });
SyncedCron.add = function(entry) {
  check(entry.name, String);
  check(entry.schedule, Function);
  check(entry.job, Function);

  // check
  this._entries.push(entry);
}

// Start processing added jobs
SyncedCron.start = function() {
  var self = this;

  // Schedule each job with later.js
  this._entries.forEach(function(entry) {
    var schedule = entry.schedule(Later.parse);
    self._timer = self._laterSetInterval(self._entryWrapper(entry), schedule);

    console.log('SyncedCron: scheduled "' + entry.name + '" next run @' 
      + Later.schedule(schedule).next(1));
  });
}

// Stop processing jobs
SyncedCron.stop = function() {
  if (this._timer) {
    this._timer.clear();
    this._timer = null;
  }
}

// The meat of our logic. Checks if the specified has already run. If not,
// records that it's running the job, runs it, and records the output
SyncedCron._entryWrapper = function(entry) {
  var self = this;

  return function(intendedAt) {
    var jobHistory = {
      intendedAt: intendedAt,
      name: entry.name,
      startedAt: new Date()
    };

    // If we have a dup key error, another instance has already tried to run
    // this job.
    try {
      jobHistory._id = self._collection.insert(jobHistory);
    } catch(e) {
      // http://www.mongodb.org/about/contributors/error-codes/
      // 11000 == duplicate key error
      if (e.name === 'MongoError' && e.code === 11000) {
        console.log('SyncedCron: Not running "' + entry.name + '" again.');
        return;
      }

      throw e; 
    };

    // run and record the job
    try {
      console.log('SyncedCron: Starting "' + entry.name + '".');
      var output = entry.job(intendedAt); // <- Run the actual job
  
      console.log('SyncedCron: Finished "' + entry.name + '".');
      self._collection.update({_id: jobHistory._id}, {
        $set: {
          finishedAt: new Date(),
          result: output
        }
      });
    } catch(e) {
      console.log('SyncedCron: Exception "' + entry.name +'" ' + e.stack);
      self._collection.update({_id: jobHistory._id}, {
        $set: {
          finishedAt: new Date(),
          error: e.stack
        }
      });
    }
  };
}

// for tests
SyncedCron._reset = function() {
  this._entries = [];
  this._collection.remove({});
}

// ---------------------------------------------------------------------------
// The following two functions are lifted from the later.js package, however
// I've made the following changes:
// - Use Meteor.setTimeout and Meteor.clearTimeout
// - Added an 'intendedAt' parameter to the callback fn that specifies the precise
//   time the callback function *should* be run (so we can co-ordinate jobs)
//   between multiple, potentially laggy and unsynced machines

// From: https://github.com/bunkat/later/blob/master/src/core/setinterval.js
SyncedCron._laterSetInterval = function(fn, sched) {

  var t = SyncedCron._laterSetTimeout(scheduleTimeout, sched),
      done = false;

  /**
  * Executes the specified function and then sets the timeout for the next
  * interval.
  */
  function scheduleTimeout(intendedAt) {
    if(!done) {
      fn(intendedAt);
      t = SyncedCron._laterSetTimeout(scheduleTimeout, sched);
    }
  }

  return {

    /**
    * Clears the timeout.
    */
    clear: function() {
      done = true;
      t.clear();
    }

  };

};

// From: https://github.com/bunkat/later/blob/master/src/core/settimeout.js
SyncedCron._laterSetTimeout = function(fn, sched) {

  var s = Later.schedule(sched), t;
  scheduleTimeout();

  /**
  * Schedules the timeout to occur. If the next occurrence is greater than the
  * max supported delay (2147483647 ms) than we delay for that amount before
  * attempting to schedule the timeout again.
  */
  function scheduleTimeout() {
    var now = Date.now(),
        next = s.next(2, now),
        diff = next[0].getTime() - now,
        intendedAt = next[0];

    // minimum time to fire is one second, use next occurrence instead
    if(diff < 1000) {
      diff = next[1].getTime() - now;
      intendedAt = next[1];
    }

    if(diff < 2147483647) {
      t = Meteor.setTimeout(function() { fn(intendedAt); }, diff);
    }
    else {
      t = Meteor.setTimeout(scheduleTimeout, 2147483647);
    }
  }

  return {

    /**
    * Clears the timeout.
    */
    clear: function() {
      Meteor.clearTimeout(t);
    }

  };

};
// ---------------------------------------------------------------------------