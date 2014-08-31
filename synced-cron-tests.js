Sinon = Npm.require('sinon');
Later = Npm.require('later');

var TestEntry = {
  name: 'Test Job',
  schedule: function(parser) {
    return parser.cron('15 10 * * ? *'); // not required
  }, 
  job: function() {
    return 'ran';
  }
};

Tinytest.add('Syncing works', function(test) {
  SyncedCron._reset();
  test.equal(SyncedCron._collection.find().count(), 0);

  // added the entry ok
  SyncedCron.add(TestEntry);
  test.equal(SyncedCron._entries.length, 1);

  var entry = SyncedCron._entries[0];
  var intendedAt = new Date(); //whatever

  // first run
  SyncedCron._entryWrapper(entry)(intendedAt);
  test.equal(SyncedCron._collection.find().count(), 1);
  var jobHistory1 = SyncedCron._collection.findOne();
  test.equal(jobHistory1.result, 'ran');

  // second run
  SyncedCron._entryWrapper(entry)(intendedAt);
  test.equal(SyncedCron._collection.find().count(), 1); // should still be 1
  var jobHistory2 = SyncedCron._collection.findOne();
  test.equal(jobHistory1._id, jobHistory2._id);
});

Tinytest.add('Exceptions work', function(test) {
  SyncedCron._reset();
  SyncedCron.add(_.extend({}, TestEntry, {
      job: function() {
        throw new Meteor.Error('Haha, gotcha!');
      }
    })
  );

  var entry = SyncedCron._entries[0];
  var intendedAt = new Date(); //whatever

  // error without result
  SyncedCron._entryWrapper(entry)(intendedAt);
  test.equal(SyncedCron._collection.find().count(), 1);
  var jobHistory1 = SyncedCron._collection.findOne();
  test.equal(jobHistory1.result, undefined);
  test.matches(jobHistory1.error, /Haha, gotcha/);
});

Tinytest.add('Purging works', function(test) {
  SyncedCron._reset();
  
  SyncedCron.add(_.extend({}, TestEntry, {
      purgeLogsAfterDays: 1
    })
  );
  
  var entry = SyncedCron._entries[0];
  var intendedAt = new Date(); //whatever
  var clock = Sinon.useFakeTimers(new Date().getTime());

  // run twice
  SyncedCron._entryWrapper(entry)(intendedAt);
  intendedAt.setMinutes(intendedAt.getMinutes() + 1);
  SyncedCron._entryWrapper(entry)(intendedAt);

  test.equal(SyncedCron._collection.find().count(), 2);

  // wind clock forward then run again
  clock.tick(24 * 3600 * 1000); // simulate 1 day

  // run a third time
  intendedAt.setMinutes(intendedAt.getMinutes() + 1);
  SyncedCron._entryWrapper(entry)(intendedAt);

  // expect that entries have been purged and we're left with only the previous
  test.equal(SyncedCron._collection.find().count(), 1);

  // restore clock
  clock.restore();
});

Tinytest.add('SyncedCron.nextScheduledAtDate works', function(test) {
  SyncedCron._reset();
  test.equal(SyncedCron._collection.find().count(), 0);

  // addd 2 entries
  SyncedCron.add(TestEntry);

  var entry2 = _.extend({}, TestEntry, {
    name: 'Test Job2',
    schedule: function(parser) {
      return parser.cron('15 11 * * ? *');
    }
  });
  SyncedCron.add(entry2);

  test.equal(SyncedCron._entries.length, 2);

  SyncedCron.start();

  var date = SyncedCron.nextScheduledAtDate(TestEntry.name);
  var correctDate = Later.schedule(TestEntry.schedule(Later.parse)).next(1);
  
  test.equal(date, correctDate);
  
  // console.log('job:');
  // console.log(job);

  // var entry = SyncedCron._entries[0];
  // var intendedAt = new Date(); //whatever
  //
  // // two runs
  // SyncedCron._entryWrapper(entry)(intendedAt);
  // intendedAt.setMinutes(intendedAt.getMinutes() + 1);
  // SyncedCron._entryWrapper(entry)(intendedAt);
  // test.equal(SyncedCron._collection.find().count(), 2);
  //
  // var job = SyncedCron.getNext(TestEntry.name);
  // console.log(job);

  // var jobHistory1 = SyncedCron._collection.findOne();
  // test.equal(jobHistory1.result, 'ran');
  //
  // // second run
  // SyncedCron._entryWrapper(entry)(intendedAt);
  // test.equal(SyncedCron._collection.find().count(), 1); // should still be 1
  // var jobHistory2 = SyncedCron._collection.findOne();
  // test.equal(jobHistory1._id, jobHistory2._id);
});

