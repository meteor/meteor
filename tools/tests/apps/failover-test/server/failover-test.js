// Tests that an observeChanges created before a failover continues to work
// after the failover. Doesn't test anything in particular about writes that
// occur immediately before the failover, but does ensure that a write after the
// failover is observed.
//
// Prints various things. On success, prints SUCCESS and exits 0. On failure,
// exits non-0.

var C = new Mongo.Collection(Random.id());

var steps = {};
var nextStepTimeout = null;

var setNextStepTimeout = function () {
  nextStepTimeout = Meteor.setTimeout(function () {
    console.log('Waited too long and no next step happened.');
    process.exit(1);
  }, 30*1000);
};

var originalMasterName = null;

steps.initialized = function () {
  // Great, we got the first thing. Let's get another thing.
  C.insert({step: 'next'});
  var master = C.rawDatabase().serverConfig._state.master;
  if (!master) {
    console.log("No master in initialized?");
    process.exit(1);
  }
  originalMasterName = master.name;
  console.log("Master starts as", originalMasterName);
};

steps.next = function () {
  // Great, we can continue to add things. Now trigger a failover.
  C.rawDatabase().admin().command({replSetStepDown: 60, force: true});
  while (true) {
    try {
      console.log("trying to insert");
      C.insert({step: 'steppedDown'});
      console.log("inserted");
      return;
    } catch (e) {
      console.log("failed to insert", e);
    }
  }
};

steps.steppedDown = function () {
  console.log("Write succeeded after stepdown.");
  var master = C.rawDatabase().serverConfig._state.master;
  if (!master) {
    console.log("No master in steppedDown?");
    process.exit(1);
  }
  if (master.name === originalMasterName) {
    console.log("Master didn't change?");
    process.exit(1);
  }
  console.log("Master ended as", master.name);
  console.log("SUCCESS");
  process.exit(0);
};

C.find().observeChanges({
  added: function (id, fields) {
    if (nextStepTimeout) {
      Meteor.clearTimeout(nextStepTimeout);
      nextStepTimeout = null;
    }
    if (!fields.step && _.has(steps, fields.step)) {
      console.log('Unexpected step:', fields.step);
      process.exit(1);
    }
    console.log("Step", fields.step);
    steps[fields.step]();
    setNextStepTimeout();
  }
});

setNextStepTimeout();

C.insert({step: 'initialized'});

main = function (argv) {
  return 'DAEMON';
};
