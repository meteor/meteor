var TestEntry = {
  name: 'Test Job',
  schedule: function(parser) {
    return parser.text('every 5 seconds'); // not required
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
