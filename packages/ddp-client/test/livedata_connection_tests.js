import lolex from 'lolex';
import { DDP } from '../common/namespace.js';
import { Connection } from '../common/livedata_connection.js';

const newConnection = function(stream, options) {
  // Some of these tests leave outstanding methods with no result yet
  // returned. This should not block us from re-running tests when sources
  // change.
  return new Connection(
    stream,
    _.extend(
      {
        reloadWithOutstanding: true,
        bufferedWritesInterval: 0
      },
      options
    )
  );
};

const makeConnectMessage = function(session) {
  const msg = {
    msg: 'connect',
    version: DDPCommon.SUPPORTED_DDP_VERSIONS[0],
    support: DDPCommon.SUPPORTED_DDP_VERSIONS
  };

  if (session) msg.session = session;
  return msg;
};

// Tests that stream got a message that matches expected.
// Expected is normally an object, and allows a wildcard value of '*',
// which will then match any value.
// Returns the message (parsed as a JSON object if expected is an object);
// which is particularly handy if you want to extract a value that was
// matched as a wildcard.
const testGotMessage = function(test, stream, expected) {
  if (stream.sent.length === 0) {
    test.fail({ error: 'no message received', expected: expected });
    return undefined;
  }

  let got = stream.sent.shift();

  if (typeof got === 'string' && typeof expected === 'object')
    got = JSON.parse(got);

  // An expected value of '*' matches any value, and the matching value (or
  // array of matching values, if there are multiple) is returned from this
  // function.
  if (typeof expected === 'object') {
    const keysWithStarValues = [];
    _.each(expected, function(v, k) {
      if (v === '*') keysWithStarValues.push(k);
    });
    _.each(keysWithStarValues, function(k) {
      expected[k] = got[k];
    });
  }

  test.equal(got, expected);
  return got;
};

const startAndConnect = function(test, stream) {
  stream.reset(); // initial connection start.

  testGotMessage(test, stream, makeConnectMessage());
  test.length(stream.sent, 0);

  stream.receive({ msg: 'connected', session: SESSION_ID });
  test.length(stream.sent, 0);
};

const SESSION_ID = '17';

Tinytest.add('livedata stub - receive data', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);

  startAndConnect(test, stream);

  // data comes in for unknown collection.
  const coll_name = Random.id();
  stream.receive({
    msg: 'added',
    collection: coll_name,
    id: '1234',
    fields: { a: 1 }
  });
  // break throught the black box and test internal state
  test.length(conn._updatesForUnknownStores[coll_name], 1);

  // XXX: Test that the old signature of passing manager directly instead of in
  // options works.
  const coll = new Mongo.Collection(coll_name, conn);

  // queue has been emptied and doc is in db.
  test.isUndefined(conn._updatesForUnknownStores[coll_name]);
  test.equal(coll.find({}).fetch(), [{ _id: '1234', a: 1 }]);

  // second message. applied directly to the db.
  stream.receive({
    msg: 'changed',
    collection: coll_name,
    id: '1234',
    fields: { a: 2 }
  });
  test.equal(coll.find({}).fetch(), [{ _id: '1234', a: 2 }]);
  test.isUndefined(conn._updatesForUnknownStores[coll_name]);
});

Tinytest.add('livedata stub - buffering data', function(test) {
  // Install special setTimeout that allows tick-by-tick control in tests using sinonjs 'lolex'
  // This needs to be before the connection is instantiated.
  const clock = lolex.install();
  const tick = timeout => clock.tick(timeout);

  const stream = new StubStream();
  const conn = newConnection(stream, {
    bufferedWritesInterval: 10,
    bufferedWritesMaxAge: 40
  });

  startAndConnect(test, stream);

  const coll_name = Random.id();
  const coll = new Mongo.Collection(coll_name, conn);

  const testDocCount = count => test.equal(coll.find({}).count(), count);

  const addDoc = () => {
    stream.receive({
      msg: 'added',
      collection: coll_name,
      id: Random.id(),
      fields: {}
    });
  };

  // Starting at 0 ticks.  At this point we haven't advanced the fake clock at all.

  addDoc(); // 1st Doc
  testDocCount(0); // No doc been recognized yet because it's buffered, waiting for more.
  tick(6); // 6 total ticks
  testDocCount(0); // Ensure that the doc still hasn't shown up, despite the clock moving forward.
  tick(4); // 10 total ticks, 1st buffer interval
  testDocCount(1); // No other docs have arrived, so we 'see' the 1st doc.

  addDoc(); // 2nd doc
  tick(1); // 11 total ticks (1 since last flush)
  testDocCount(1); // Again, second doc hasn't arrived because we're waiting for more...
  tick(9); // 20 total ticks (10 ticks since last flush & the 2nd 10-tick interval)
  testDocCount(2); // Now we're here and got the second document.

  // Add several docs, frequently enough that we buffer multiple times before the next flush.
  addDoc(); // 3 docs
  tick(6); // 26 ticks (6 since last flush)
  addDoc(); // 4 docs
  tick(6); // 32 ticks (12 since last flush)
  addDoc(); // 5 docs
  tick(6); // 38 ticks (18 since last flush)
  addDoc(); // 6 docs
  tick(6); // 44 ticks (24 since last flush)
  addDoc(); // 7 docs
  tick(9); // 53 ticks (33 since last flush)
  addDoc(); // 8 docs
  tick(9); // 62 ticks! (42 ticks since last flush, over max-age - next interval triggers flush)
  testDocCount(2); // Still at 2 from before! (Just making sure)
  tick(1); // Ok, 63 ticks (10 since last doc, so this should cause the flush of all the docs)
  testDocCount(8); // See all the docs.

  // Put things back how they were.
  clock.uninstall();
});

Tinytest.add('livedata stub - subscribe', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);

  startAndConnect(test, stream);

  // subscribe
  let callback_fired = false;
  const sub = conn.subscribe('my_data', function() {
    callback_fired = true;
  });
  test.isFalse(callback_fired);

  test.length(stream.sent, 1);
  let message = JSON.parse(stream.sent.shift());
  const id = message.id;
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'my_data', params: [] });

  let reactivelyReady = false;
  const autorunHandle = Tracker.autorun(function() {
    reactivelyReady = sub.ready();
  });
  test.isFalse(reactivelyReady);

  // get the sub satisfied. callback fires.
  stream.receive({ msg: 'ready', subs: [id] });
  test.isTrue(callback_fired);
  Tracker.flush();
  test.isTrue(reactivelyReady);

  // Unsubscribe.
  sub.stop();
  test.length(stream.sent, 1);
  message = JSON.parse(stream.sent.shift());
  test.equal(message, { msg: 'unsub', id: id });
  Tracker.flush();
  test.isFalse(reactivelyReady);

  // Resubscribe.
  conn.subscribe('my_data');
  test.length(stream.sent, 1);
  message = JSON.parse(stream.sent.shift());
  const id2 = message.id;
  test.notEqual(id, id2);
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'my_data', params: [] });
});

Tinytest.add('livedata stub - reactive subscribe', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);

  startAndConnect(test, stream);

  const rFoo = new ReactiveVar('foo1');
  const rBar = new ReactiveVar('bar1');

  const onReadyCount = {};
  const onReady = function(tag) {
    return function() {
      if (_.has(onReadyCount, tag)) ++onReadyCount[tag];
      else onReadyCount[tag] = 1;
    };
  };

  // Subscribe to some subs.
  let stopperHandle, completerHandle;
  const autorunHandle = Tracker.autorun(function() {
    conn.subscribe('foo', rFoo.get(), onReady(rFoo.get()));
    conn.subscribe('bar', rBar.get(), onReady(rBar.get()));
    completerHandle = conn.subscribe('completer', onReady('completer'));
    stopperHandle = conn.subscribe('stopper', onReady('stopper'));
  });

  let completerReady;
  const readyAutorunHandle = Tracker.autorun(function() {
    completerReady = completerHandle.ready();
  });

  // Check sub messages. (Assume they are sent in the order executed.)
  test.length(stream.sent, 4);
  let message = JSON.parse(stream.sent.shift());
  const idFoo1 = message.id;
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'foo', params: ['foo1'] });

  message = JSON.parse(stream.sent.shift());
  const idBar1 = message.id;
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'bar', params: ['bar1'] });

  message = JSON.parse(stream.sent.shift());
  const idCompleter = message.id;
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'completer', params: [] });

  message = JSON.parse(stream.sent.shift());
  const idStopper = message.id;
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'stopper', params: [] });

  // Haven't hit onReady yet.
  test.equal(onReadyCount, {});
  Tracker.flush();
  test.isFalse(completerReady);

  // "completer" gets ready now. its callback should fire.
  stream.receive({ msg: 'ready', subs: [idCompleter] });
  test.equal(onReadyCount, { completer: 1 });
  test.length(stream.sent, 0);
  Tracker.flush();
  test.isTrue(completerReady);

  // Stop 'stopper'.
  stopperHandle.stop();
  test.length(stream.sent, 1);
  message = JSON.parse(stream.sent.shift());
  test.equal(message, { msg: 'unsub', id: idStopper });

  test.equal(onReadyCount, { completer: 1 });
  Tracker.flush();
  test.isTrue(completerReady);

  // Change the foo subscription and flush. We should sub to the new foo
  // subscription, re-sub to the stopper subscription, and then unsub from the old
  // foo subscription. The bar subscription should be unaffected. The completer
  // subscription should call its new onReady callback, because we always
  // call onReady for a given reactively-saved subscription.
  // The completerHandle should have been reestablished to the ready handle.
  rFoo.set('foo2');
  Tracker.flush();
  test.length(stream.sent, 3);

  message = JSON.parse(stream.sent.shift());
  const idFoo2 = message.id;
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'foo', params: ['foo2'] });

  message = JSON.parse(stream.sent.shift());
  const idStopperAgain = message.id;
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'stopper', params: [] });

  message = JSON.parse(stream.sent.shift());
  test.equal(message, { msg: 'unsub', id: idFoo1 });

  test.equal(onReadyCount, { completer: 2 });
  test.isTrue(completerReady);

  // Ready the stopper and bar subs. Completing stopper should call only the
  // onReady from the new subscription because they were separate subscriptions
  // started at different times and the first one was explicitly torn down by
  // the client; completing bar should call the onReady from the new
  // subscription because we always call onReady for a given reactively-saved
  // subscription.
  stream.receive({ msg: 'ready', subs: [idStopperAgain, idBar1] });
  test.equal(onReadyCount, { completer: 2, bar1: 1, stopper: 1 });

  // Shut down the autorun. This should unsub us from all current subs at flush
  // time.
  autorunHandle.stop();
  Tracker.flush();
  test.isFalse(completerReady);
  readyAutorunHandle.stop();

  test.length(stream.sent, 4);
  // The order of unsubs here is not important.
  const unsubMessages = _.map(stream.sent, JSON.parse);
  stream.sent.length = 0;
  test.equal(_.unique(_.pluck(unsubMessages, 'msg')), ['unsub']);
  const actualIds = _.pluck(unsubMessages, 'id');
  const expectedIds = [idFoo2, idBar1, idCompleter, idStopperAgain];
  actualIds.sort();
  expectedIds.sort();
  test.equal(actualIds, expectedIds);
});

Tinytest.add('livedata stub - reactive subscribe handle correct', function(
  test
) {
  const stream = new StubStream();
  const conn = newConnection(stream);

  startAndConnect(test, stream);

  const rFoo = new ReactiveVar('foo1');

  // Subscribe to some subs.
  let fooHandle, fooReady;
  const autorunHandle = Tracker.autorun(function() {
    fooHandle = conn.subscribe('foo', rFoo.get());
    Tracker.autorun(function() {
      fooReady = fooHandle.ready();
    });
  });

  let message = JSON.parse(stream.sent.shift());
  const idFoo1 = message.id;
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'foo', params: ['foo1'] });

  // Not ready yet
  Tracker.flush();
  test.isFalse(fooHandle.ready());
  test.isFalse(fooReady);

  // change the argument to foo. This will make a new handle, which isn't ready
  // the ready autorun should invalidate, reading the new false value, and
  // setting up a new dep which goes true soon
  rFoo.set('foo2');
  Tracker.flush();
  test.length(stream.sent, 2);

  message = JSON.parse(stream.sent.shift());
  const idFoo2 = message.id;
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'foo', params: ['foo2'] });

  message = JSON.parse(stream.sent.shift());
  test.equal(message, { msg: 'unsub', id: idFoo1 });

  Tracker.flush();
  test.isFalse(fooHandle.ready());
  test.isFalse(fooReady);

  // "foo" gets ready now. The handle should be ready and the autorun rerun
  stream.receive({ msg: 'ready', subs: [idFoo2] });
  test.length(stream.sent, 0);
  Tracker.flush();
  test.isTrue(fooHandle.ready());
  test.isTrue(fooReady);

  // change the argument to foo. This will make a new handle, which isn't ready
  // the ready autorun should invalidate, making fooReady false too
  rFoo.set('foo3');
  Tracker.flush();
  test.length(stream.sent, 2);

  message = JSON.parse(stream.sent.shift());
  const idFoo3 = message.id;
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'foo', params: ['foo3'] });

  message = JSON.parse(stream.sent.shift());
  test.equal(message, { msg: 'unsub', id: idFoo2 });

  Tracker.flush();
  test.isFalse(fooHandle.ready());
  test.isFalse(fooReady);

  // "foo" gets ready again
  stream.receive({ msg: 'ready', subs: [idFoo3] });
  test.length(stream.sent, 0);
  Tracker.flush();
  test.isTrue(fooHandle.ready());
  test.isTrue(fooReady);

  autorunHandle.stop();
});

Tinytest.add('livedata stub - this', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);

  startAndConnect(test, stream);
  conn.methods({
    test_this: function() {
      test.isTrue(this.isSimulation);
      this.unblock(); // should be a no-op
    }
  });

  // should throw no exceptions
  conn.call('test_this', _.identity);
  // satisfy method, quiesce connection
  let message = JSON.parse(stream.sent.shift());
  test.isUndefined(message.randomSeed);
  test.equal(message, {
    msg: 'method',
    method: 'test_this',
    params: [],
    id: message.id
  });
  test.length(stream.sent, 0);

  stream.receive({ msg: 'result', id: message.id, result: null });
  stream.receive({ msg: 'updated', methods: [message.id] });
});

if (Meteor.isClient) {
  Tinytest.add('livedata stub - methods', function(test) {
    const stream = new StubStream();
    const conn = newConnection(stream);

    startAndConnect(test, stream);

    const collName = Random.id();
    const coll = new Mongo.Collection(collName, { connection: conn });

    // setup method
    conn.methods({
      do_something: function(x) {
        coll.insert({ value: x });
      }
    });

    // setup observers
    const counts = { added: 0, removed: 0, changed: 0, moved: 0 };
    const handle = coll.find({}).observe({
      addedAt: function() {
        counts.added += 1;
      },
      removedAt: function() {
        counts.removed += 1;
      },
      changedAt: function() {
        counts.changed += 1;
      },
      movedTo: function() {
        counts.moved += 1;
      }
    });

    // call method with results callback
    let callback1Fired = false;
    conn.call('do_something', 'friday!', function(err, res) {
      test.isUndefined(err);
      test.equal(res, '1234');
      callback1Fired = true;
    });
    test.isFalse(callback1Fired);

    // observers saw the method run.
    test.equal(counts, { added: 1, removed: 0, changed: 0, moved: 0 });

    // get response from server
    const message = testGotMessage(test, stream, {
      msg: 'method',
      method: 'do_something',
      params: ['friday!'],
      id: '*',
      randomSeed: '*'
    });

    test.equal(coll.find({}).count(), 1);
    test.equal(coll.find({ value: 'friday!' }).count(), 1);
    const docId = coll.findOne({ value: 'friday!' })._id;

    // results does not yet result in callback, because data is not
    // ready.
    stream.receive({ msg: 'result', id: message.id, result: '1234' });
    test.isFalse(callback1Fired);

    // result message doesn't affect data
    test.equal(coll.find({}).count(), 1);
    test.equal(coll.find({ value: 'friday!' }).count(), 1);
    test.equal(counts, { added: 1, removed: 0, changed: 0, moved: 0 });

    // data methods do not show up (not quiescent yet)
    stream.receive({
      msg: 'added',
      collection: collName,
      id: MongoID.idStringify(docId),
      fields: { value: 'tuesday' }
    });
    test.equal(coll.find({}).count(), 1);
    test.equal(coll.find({ value: 'friday!' }).count(), 1);
    test.equal(counts, { added: 1, removed: 0, changed: 0, moved: 0 });

    // send another methods (unknown on client)
    let callback2Fired = false;
    conn.call('do_something_else', 'monday', function(err, res) {
      callback2Fired = true;
    });
    test.isFalse(callback1Fired);
    test.isFalse(callback2Fired);

    // test we still send a method request to server
    const message2 = JSON.parse(stream.sent.shift());
    test.isUndefined(message2.randomSeed);
    test.equal(message2, {
      msg: 'method',
      method: 'do_something_else',
      params: ['monday'],
      id: message2.id
    });

    // get the first data satisfied message. changes are applied to database even
    // though another method is outstanding, because the other method didn't have
    // a stub. and its callback is called.
    stream.receive({ msg: 'updated', methods: [message.id] });
    test.isTrue(callback1Fired);
    test.isFalse(callback2Fired);

    test.equal(coll.find({}).count(), 1);
    test.equal(coll.find({ value: 'tuesday' }).count(), 1);
    test.equal(counts, { added: 1, removed: 0, changed: 1, moved: 0 });

    // second result
    stream.receive({ msg: 'result', id: message2.id, result: 'bupkis' });
    test.isFalse(callback2Fired);

    // get second satisfied; no new changes are applied.
    stream.receive({ msg: 'updated', methods: [message2.id] });
    test.isTrue(callback2Fired);

    test.equal(coll.find({}).count(), 1);
    test.equal(coll.find({ value: 'tuesday', _id: docId }).count(), 1);
    test.equal(counts, { added: 1, removed: 0, changed: 1, moved: 0 });

    handle.stop();
  });
}

Tinytest.add('livedata stub - mutating method args', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);

  startAndConnect(test, stream);

  conn.methods({
    mutateArgs: function(arg) {
      arg.foo = 42;
    }
  });

  conn.call('mutateArgs', { foo: 50 }, _.identity);

  // Method should be called with original arg, not mutated arg.
  let message = JSON.parse(stream.sent.shift());
  test.isUndefined(message.randomSeed);
  test.equal(message, {
    msg: 'method',
    method: 'mutateArgs',
    params: [{ foo: 50 }],
    id: message.id
  });
  test.length(stream.sent, 0);
});

const observeCursor = function(test, cursor) {
  const counts = { added: 0, removed: 0, changed: 0, moved: 0 };
  const expectedCounts = _.clone(counts);
  const handle = cursor.observe({
    addedAt: function() {
      counts.added += 1;
    },
    removedAt: function() {
      counts.removed += 1;
    },
    changedAt: function() {
      counts.changed += 1;
    },
    movedTo: function() {
      counts.moved += 1;
    }
  });
  return {
    stop: _.bind(handle.stop, handle),
    expectCallbacks: function(delta) {
      _.each(delta, function(mod, field) {
        expectedCounts[field] += mod;
      });
      test.equal(counts, expectedCounts);
    }
  };
};

// method calls another method in simulation. see not sent.
if (Meteor.isClient) {
  Tinytest.add('livedata stub - methods calling methods', function(test) {
    const stream = new StubStream();
    const conn = newConnection(stream);

    startAndConnect(test, stream);

    const coll_name = Random.id();
    const coll = new Mongo.Collection(coll_name, { connection: conn });

    // setup methods
    conn.methods({
      do_something: function() {
        conn.call('do_something_else');
      },
      do_something_else: function() {
        coll.insert({ a: 1 });
      }
    });

    const o = observeCursor(test, coll.find());

    // call method.
    conn.call('do_something', _.identity);

    // see we only send message for outer methods
    const message = testGotMessage(test, stream, {
      msg: 'method',
      method: 'do_something',
      params: [],
      id: '*',
      randomSeed: '*'
    });
    test.length(stream.sent, 0);

    // but inner method runs locally.
    o.expectCallbacks({ added: 1 });
    test.equal(coll.find().count(), 1);
    const docId = coll.findOne()._id;
    test.equal(coll.findOne(), { _id: docId, a: 1 });

    // we get the results
    stream.receive({ msg: 'result', id: message.id, result: '1234' });

    // get data from the method. data from this doc does not show up yet, but data
    // from another doc does.
    stream.receive({
      msg: 'added',
      collection: coll_name,
      id: MongoID.idStringify(docId),
      fields: { value: 'tuesday' }
    });
    o.expectCallbacks();
    test.equal(coll.findOne(docId), { _id: docId, a: 1 });
    stream.receive({
      msg: 'added',
      collection: coll_name,
      id: 'monkey',
      fields: { value: 'bla' }
    });
    o.expectCallbacks({ added: 1 });
    test.equal(coll.findOne(docId), { _id: docId, a: 1 });
    const newDoc = coll.findOne({ value: 'bla' });
    test.isTrue(newDoc);
    test.equal(newDoc, { _id: newDoc._id, value: 'bla' });

    // get method satisfied. all data shows up. the 'a' field is reverted and
    // 'value' field is set.
    stream.receive({ msg: 'updated', methods: [message.id] });
    o.expectCallbacks({ changed: 1 });
    test.equal(coll.findOne(docId), { _id: docId, value: 'tuesday' });
    test.equal(coll.findOne(newDoc._id), { _id: newDoc._id, value: 'bla' });

    o.stop();
  });
}
Tinytest.add('livedata stub - method call before connect', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);

  const callbackOutput = [];
  conn.call('someMethod', function(err, result) {
    callbackOutput.push(result);
  });
  test.equal(callbackOutput, []);

  // the real stream drops all output pre-connection
  stream.sent.length = 0;

  // Now connect.
  stream.reset();

  testGotMessage(test, stream, makeConnectMessage());
  testGotMessage(test, stream, {
    msg: 'method',
    method: 'someMethod',
    params: [],
    id: '*'
  });
});

Tinytest.add('livedata stub - reconnect', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);

  startAndConnect(test, stream);

  const collName = Random.id();
  const coll = new Mongo.Collection(collName, { connection: conn });

  const o = observeCursor(test, coll.find());

  // subscribe
  let subCallbackFired = false;
  const sub = conn.subscribe('my_data', function() {
    subCallbackFired = true;
  });
  test.isFalse(subCallbackFired);

  let subMessage = JSON.parse(stream.sent.shift());
  test.equal(subMessage, {
    msg: 'sub',
    name: 'my_data',
    params: [],
    id: subMessage.id
  });

  // get some data. it shows up.
  stream.receive({
    msg: 'added',
    collection: collName,
    id: '1234',
    fields: { a: 1 }
  });

  test.equal(coll.find({}).count(), 1);
  o.expectCallbacks({ added: 1 });
  test.isFalse(subCallbackFired);

  stream.receive({
    msg: 'changed',
    collection: collName,
    id: '1234',
    fields: { b: 2 }
  });
  stream.receive({
    msg: 'ready',
    subs: [subMessage.id] // satisfy sub
  });
  test.isTrue(subCallbackFired);
  subCallbackFired = false; // re-arm for test that it doesn't fire again.

  test.equal(coll.find({ a: 1, b: 2 }).count(), 1);
  o.expectCallbacks({ changed: 1 });

  // call method.
  let methodCallbackFired = false;
  conn.call('do_something', function() {
    methodCallbackFired = true;
  });

  conn.apply('do_something_else', [], { wait: true }, _.identity);
  conn.apply('do_something_later', [], _.identity);

  test.isFalse(methodCallbackFired);

  // The non-wait method should send, but not the wait method.
  let methodMessage = JSON.parse(stream.sent.shift());
  test.isUndefined(methodMessage.randomSeed);
  test.equal(methodMessage, {
    msg: 'method',
    method: 'do_something',
    params: [],
    id: methodMessage.id
  });
  test.equal(stream.sent.length, 0);

  // more data. shows up immediately because there was no relevant method stub.
  stream.receive({
    msg: 'changed',
    collection: collName,
    id: '1234',
    fields: { c: 3 }
  });
  test.equal(coll.findOne('1234'), { _id: '1234', a: 1, b: 2, c: 3 });
  o.expectCallbacks({ changed: 1 });

  // stream reset. reconnect!  we send a connect, our pending method, and our
  // sub. The wait method still is blocked.
  stream.reset();

  testGotMessage(test, stream, makeConnectMessage(SESSION_ID));
  testGotMessage(test, stream, methodMessage);
  testGotMessage(test, stream, subMessage);

  // reconnect with different session id
  stream.receive({ msg: 'connected', session: SESSION_ID + 1 });

  // resend data. doesn't show up: we're in reconnect quiescence.
  stream.receive({
    msg: 'added',
    collection: collName,
    id: '1234',
    fields: { a: 1, b: 2, c: 3, d: 4 }
  });
  stream.receive({
    msg: 'added',
    collection: collName,
    id: '2345',
    fields: { e: 5 }
  });
  test.equal(coll.findOne('1234'), { _id: '1234', a: 1, b: 2, c: 3 });
  test.isFalse(coll.findOne('2345'));
  o.expectCallbacks();

  // satisfy and return the method
  stream.receive({
    msg: 'updated',
    methods: [methodMessage.id]
  });
  test.isFalse(methodCallbackFired);
  stream.receive({ msg: 'result', id: methodMessage.id, result: 'bupkis' });
  // The callback still doesn't fire (and we don't send the wait method): we're
  // still in global quiescence
  test.isFalse(methodCallbackFired);
  test.equal(stream.sent.length, 0);

  // still no update.
  test.equal(coll.findOne('1234'), { _id: '1234', a: 1, b: 2, c: 3 });
  test.isFalse(coll.findOne('2345'));
  o.expectCallbacks();

  // re-satisfy sub
  stream.receive({ msg: 'ready', subs: [subMessage.id] });

  // now the doc changes and method callback is called, and the wait method is
  // sent. the sub callback isn't re-called.
  test.isTrue(methodCallbackFired);
  test.isFalse(subCallbackFired);
  test.equal(coll.findOne('1234'), { _id: '1234', a: 1, b: 2, c: 3, d: 4 });
  test.equal(coll.findOne('2345'), { _id: '2345', e: 5 });
  o.expectCallbacks({ added: 1, changed: 1 });

  let waitMethodMessage = JSON.parse(stream.sent.shift());
  test.isUndefined(waitMethodMessage.randomSeed);
  test.equal(waitMethodMessage, {
    msg: 'method',
    method: 'do_something_else',
    params: [],
    id: waitMethodMessage.id
  });
  test.equal(stream.sent.length, 0);
  stream.receive({ msg: 'result', id: waitMethodMessage.id, result: 'bupkis' });
  test.equal(stream.sent.length, 0);
  stream.receive({ msg: 'updated', methods: [waitMethodMessage.id] });

  // wait method done means we can send the third method
  test.equal(stream.sent.length, 1);
  let laterMethodMessage = JSON.parse(stream.sent.shift());
  test.isUndefined(laterMethodMessage.randomSeed);
  test.equal(laterMethodMessage, {
    msg: 'method',
    method: 'do_something_later',
    params: [],
    id: laterMethodMessage.id
  });

  o.stop();
});

if (Meteor.isClient) {
  Tinytest.add('livedata stub - reconnect non-idempotent method', function(
    test
  ) {
    // This test is for https://github.com/meteor/meteor/issues/6108
    const stream = new StubStream();
    const conn = newConnection(stream);

    startAndConnect(test, stream);

    let firstMethodCallbackFired = false;
    let firstMethodCallbackErrored = false;
    let secondMethodCallbackFired = false;
    let secondMethodCallbackErrored = false;

    // call with noRetry true so that the method should fail to retry on reconnect.
    conn.apply('do_something', [], { noRetry: true }, function(error) {
      firstMethodCallbackFired = true;
      // failure on reconnect should trigger an error.
      if (error && error.error === 'invocation-failed') {
        firstMethodCallbackErrored = true;
      }
    });
    conn.apply('do_something_else', [], { noRetry: true }, function(error) {
      secondMethodCallbackFired = true;
      // failure on reconnect should trigger an error.
      if (error && error.error === 'invocation-failed') {
        secondMethodCallbackErrored = true;
      }
    });

    // The method has not succeeded yet
    test.isFalse(firstMethodCallbackFired);
    test.isFalse(secondMethodCallbackFired);

    // send the methods
    stream.sent.shift();
    stream.sent.shift();
    // reconnect
    stream.reset();

    // verify that a reconnect message was sent.
    testGotMessage(test, stream, makeConnectMessage(SESSION_ID));
    // Make sure that the stream triggers connection.
    stream.receive({ msg: 'connected', session: SESSION_ID + 1 });

    //The method callback should fire even though the stream has not sent a response.
    //the callback should have been fired with an error.
    test.isTrue(firstMethodCallbackFired);
    test.isTrue(firstMethodCallbackErrored);
    test.isTrue(secondMethodCallbackFired);
    test.isTrue(secondMethodCallbackErrored);

    // verify that the method message was not sent.
    test.isUndefined(stream.sent.shift());
  });
}

function addReconnectTests(name, testFunc) {
  Tinytest.add(name + ' (deprecated)', function(test) {
    function deprecatedSetOnReconnect(conn, handler) {
      conn.onReconnect = handler;
    }
    testFunc.call(this, test, deprecatedSetOnReconnect);
  });

  Tinytest.add(name, function(test) {
    let stopper;
    function setOnReconnect(conn, handler) {
      stopper && stopper.stop();
      stopper = DDP.onReconnect(function(reconnectingConn) {
        if (reconnectingConn === conn) {
          handler();
        }
      });
    }
    testFunc.call(this, test, setOnReconnect);
    stopper && stopper.stop();
  });
}

if (Meteor.isClient) {
  addReconnectTests(
    'livedata stub - reconnect method which only got result',
    function(test, setOnReconnect) {
      const stream = new StubStream();
      const conn = newConnection(stream);
      startAndConnect(test, stream);

      const collName = Random.id();
      const coll = new Mongo.Collection(collName, { connection: conn });
      const o = observeCursor(test, coll.find());

      conn.methods({
        writeSomething: function() {
          // stub write
          coll.insert({ foo: 'bar' });
        }
      });

      test.equal(coll.find({ foo: 'bar' }).count(), 0);

      // Call a method. We'll get the result but not data-done before reconnect.
      const callbackOutput = [];
      const onResultReceivedOutput = [];
      conn.apply(
        'writeSomething',
        [],
        {
          onResultReceived: function(err, result) {
            onResultReceivedOutput.push(result);
          }
        },
        function(err, result) {
          callbackOutput.push(result);
        }
      );
      // Stub write is visible.
      test.equal(coll.find({ foo: 'bar' }).count(), 1);
      const stubWrittenId = coll.findOne({ foo: 'bar' })._id;
      o.expectCallbacks({ added: 1 });
      // Callback not called.
      test.equal(callbackOutput, []);
      test.equal(onResultReceivedOutput, []);
      // Method sent.
      const methodId = testGotMessage(test, stream, {
        msg: 'method',
        method: 'writeSomething',
        params: [],
        id: '*',
        randomSeed: '*'
      }).id;
      test.equal(stream.sent.length, 0);

      // Get some data.
      stream.receive({
        msg: 'added',
        collection: collName,
        id: MongoID.idStringify(stubWrittenId),
        fields: { baz: 42 }
      });
      // It doesn't show up yet.
      test.equal(coll.find().count(), 1);
      test.equal(coll.findOne(stubWrittenId), {
        _id: stubWrittenId,
        foo: 'bar'
      });
      o.expectCallbacks();

      // Get the result.
      stream.receive({ msg: 'result', id: methodId, result: 'bla' });
      // Data unaffected.
      test.equal(coll.find().count(), 1);
      test.equal(coll.findOne(stubWrittenId), {
        _id: stubWrittenId,
        foo: 'bar'
      });
      o.expectCallbacks();
      // Callback not called, but onResultReceived is.
      test.equal(callbackOutput, []);
      test.equal(onResultReceivedOutput, ['bla']);

      // Reset stream. Method does NOT get resent, because its result is already
      // in. Reconnect quiescence happens as soon as 'connected' is received because
      // there are no pending methods or subs in need of revival.
      stream.reset();
      testGotMessage(test, stream, makeConnectMessage(SESSION_ID));
      // Still holding out hope for session resumption, so nothing updated yet.
      test.equal(coll.find().count(), 1);
      test.equal(coll.findOne(stubWrittenId), {
        _id: stubWrittenId,
        foo: 'bar'
      });
      o.expectCallbacks();
      test.equal(callbackOutput, []);

      // Receive 'connected': time for reconnect quiescence! Data gets updated
      // locally (ie, data is reset) and callback gets called.
      stream.receive({ msg: 'connected', session: SESSION_ID + 1 });
      test.equal(coll.find().count(), 0);
      o.expectCallbacks({ removed: 1 });
      test.equal(callbackOutput, ['bla']);
      test.equal(onResultReceivedOutput, ['bla']);
      stream.receive({
        msg: 'added',
        collection: collName,
        id: MongoID.idStringify(stubWrittenId),
        fields: { baz: 42 }
      });
      test.equal(coll.findOne(stubWrittenId), { _id: stubWrittenId, baz: 42 });
      o.expectCallbacks({ added: 1 });

      // Run method again. We're going to do the same thing this time, except we're
      // also going to use an onReconnect to insert another method at reconnect
      // time, which will delay reconnect quiescence.
      conn.apply(
        'writeSomething',
        [],
        {
          onResultReceived: function(err, result) {
            onResultReceivedOutput.push(result);
          }
        },
        function(err, result) {
          callbackOutput.push(result);
        }
      );
      // Stub write is visible.
      test.equal(coll.find({ foo: 'bar' }).count(), 1);
      const stubWrittenId2 = coll.findOne({ foo: 'bar' })._id;
      o.expectCallbacks({ added: 1 });
      // Callback not called.
      test.equal(callbackOutput, ['bla']);
      test.equal(onResultReceivedOutput, ['bla']);
      // Method sent.
      const methodId2 = testGotMessage(test, stream, {
        msg: 'method',
        method: 'writeSomething',
        params: [],
        id: '*',
        randomSeed: '*'
      }).id;
      test.equal(stream.sent.length, 0);

      // Get some data.
      stream.receive({
        msg: 'added',
        collection: collName,
        id: MongoID.idStringify(stubWrittenId2),
        fields: { baz: 42 }
      });
      // It doesn't show up yet.
      test.equal(coll.find().count(), 2);
      test.equal(coll.findOne(stubWrittenId2), {
        _id: stubWrittenId2,
        foo: 'bar'
      });
      o.expectCallbacks();

      // Get the result.
      stream.receive({ msg: 'result', id: methodId2, result: 'blab' });
      // Data unaffected.
      test.equal(coll.find().count(), 2);
      test.equal(coll.findOne(stubWrittenId2), {
        _id: stubWrittenId2,
        foo: 'bar'
      });
      o.expectCallbacks();
      // Callback not called, but onResultReceived is.
      test.equal(callbackOutput, ['bla']);
      test.equal(onResultReceivedOutput, ['bla', 'blab']);
      setOnReconnect(conn, function() {
        conn.call('slowMethod', function(err, result) {
          callbackOutput.push(result);
        });
      });

      // Reset stream. Method does NOT get resent, because its result is already in,
      // but slowMethod gets called via onReconnect. Reconnect quiescence is now
      // blocking on slowMethod.
      stream.reset();
      testGotMessage(test, stream, makeConnectMessage(SESSION_ID + 1));
      const slowMethodId = testGotMessage(test, stream, {
        msg: 'method',
        method: 'slowMethod',
        params: [],
        id: '*'
      }).id;
      // Still holding out hope for session resumption, so nothing updated yet.
      test.equal(coll.find().count(), 2);
      test.equal(coll.findOne(stubWrittenId2), {
        _id: stubWrittenId2,
        foo: 'bar'
      });
      o.expectCallbacks();
      test.equal(callbackOutput, ['bla']);

      // Receive 'connected'... but no reconnect quiescence yet due to slowMethod.
      stream.receive({ msg: 'connected', session: SESSION_ID + 2 });
      test.equal(coll.find().count(), 2);
      test.equal(coll.findOne(stubWrittenId2), {
        _id: stubWrittenId2,
        foo: 'bar'
      });
      o.expectCallbacks();
      test.equal(callbackOutput, ['bla']);

      // Receive data matching our stub. It doesn't take effect yet.
      stream.receive({
        msg: 'added',
        collection: collName,
        id: MongoID.idStringify(stubWrittenId2),
        fields: { foo: 'bar' }
      });
      o.expectCallbacks();

      // slowMethod is done writing, so we get full reconnect quiescence (but no
      // slowMethod callback)... ie, a reset followed by applying the data we just
      // got, as well as calling the callback from the method that half-finished
      // before reset. The net effect is deleting doc 'stubWrittenId'.
      stream.receive({ msg: 'updated', methods: [slowMethodId] });
      test.equal(coll.find().count(), 1);
      test.equal(coll.findOne(stubWrittenId2), {
        _id: stubWrittenId2,
        foo: 'bar'
      });
      o.expectCallbacks({ removed: 1 });
      test.equal(callbackOutput, ['bla', 'blab']);

      // slowMethod returns a value now.
      stream.receive({ msg: 'result', id: slowMethodId, result: 'slow' });
      o.expectCallbacks();
      test.equal(callbackOutput, ['bla', 'blab', 'slow']);

      o.stop();
    }
  );
}
Tinytest.add('livedata stub - reconnect method which only got data', function(
  test
) {
  const stream = new StubStream();
  const conn = newConnection(stream);
  startAndConnect(test, stream);

  const collName = Random.id();
  const coll = new Mongo.Collection(collName, { connection: conn });
  const o = observeCursor(test, coll.find());

  // Call a method. We'll get the data-done message but not the result before
  // reconnect.
  const callbackOutput = [];
  const onResultReceivedOutput = [];
  conn.apply(
    'doLittle',
    [],
    {
      onResultReceived: function(err, result) {
        onResultReceivedOutput.push(result);
      }
    },
    function(err, result) {
      callbackOutput.push(result);
    }
  );
  // Callbacks not called.
  test.equal(callbackOutput, []);
  test.equal(onResultReceivedOutput, []);
  // Method sent.
  const methodId = testGotMessage(test, stream, {
    msg: 'method',
    method: 'doLittle',
    params: [],
    id: '*'
  }).id;
  test.equal(stream.sent.length, 0);

  // Get some data.
  stream.receive({
    msg: 'added',
    collection: collName,
    id: 'photo',
    fields: { baz: 42 }
  });
  // It shows up instantly because the stub didn't write anything.
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('photo'), { _id: 'photo', baz: 42 });
  o.expectCallbacks({ added: 1 });

  // Get the data-done message.
  stream.receive({ msg: 'updated', methods: [methodId] });
  // Data still here.
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('photo'), { _id: 'photo', baz: 42 });
  o.expectCallbacks();
  // Method callback not called yet (no result yet).
  test.equal(callbackOutput, []);
  test.equal(onResultReceivedOutput, []);

  // Reset stream. Method gets resent (with same ID), and blocks reconnect
  // quiescence.
  stream.reset();
  testGotMessage(test, stream, makeConnectMessage(SESSION_ID));
  testGotMessage(test, stream, {
    msg: 'method',
    method: 'doLittle',
    params: [],
    id: methodId
  });
  // Still holding out hope for session resumption, so nothing updated yet.
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('photo'), { _id: 'photo', baz: 42 });
  o.expectCallbacks();
  test.equal(callbackOutput, []);
  test.equal(onResultReceivedOutput, []);

  // Receive 'connected'. Still blocking on reconnect quiescence.
  stream.receive({ msg: 'connected', session: SESSION_ID + 1 });
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('photo'), { _id: 'photo', baz: 42 });
  o.expectCallbacks();
  test.equal(callbackOutput, []);
  test.equal(onResultReceivedOutput, []);

  // Receive method result. onResultReceived is called but the main callback
  // isn't (ie, we don't get confused by the fact that we got data-done the
  // *FIRST* time through).
  stream.receive({ msg: 'result', id: methodId, result: 'res' });
  test.equal(callbackOutput, []);
  test.equal(onResultReceivedOutput, ['res']);

  // Now we get data-done. Collection is reset and callback is called.
  stream.receive({ msg: 'updated', methods: [methodId] });
  test.equal(coll.find().count(), 0);
  o.expectCallbacks({ removed: 1 });
  test.equal(callbackOutput, ['res']);
  test.equal(onResultReceivedOutput, ['res']);

  o.stop();
});
if (Meteor.isClient) {
  Tinytest.add('livedata stub - multiple stubs same doc', function(test) {
    const stream = new StubStream();
    const conn = newConnection(stream);
    startAndConnect(test, stream);

    const collName = Random.id();
    const coll = new Mongo.Collection(collName, { connection: conn });
    const o = observeCursor(test, coll.find());

    conn.methods({
      insertSomething: function() {
        // stub write
        coll.insert({ foo: 'bar' });
      },
      updateIt: function(id) {
        coll.update(id, { $set: { baz: 42 } });
      }
    });

    test.equal(coll.find().count(), 0);

    // Call the insert method.
    conn.call('insertSomething', _.identity);
    // Stub write is visible.
    test.equal(coll.find({ foo: 'bar' }).count(), 1);
    const stubWrittenId = coll.findOne({ foo: 'bar' })._id;
    o.expectCallbacks({ added: 1 });
    // Method sent.
    const insertMethodId = testGotMessage(test, stream, {
      msg: 'method',
      method: 'insertSomething',
      params: [],
      id: '*',
      randomSeed: '*'
    }).id;
    test.equal(stream.sent.length, 0);

    // Call update method.
    conn.call('updateIt', stubWrittenId, _.identity);
    // This stub write is visible too.
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId), {
      _id: stubWrittenId,
      foo: 'bar',
      baz: 42
    });
    o.expectCallbacks({ changed: 1 });
    // Method sent.
    const updateMethodId = testGotMessage(test, stream, {
      msg: 'method',
      method: 'updateIt',
      params: [stubWrittenId],
      id: '*'
    }).id;
    test.equal(stream.sent.length, 0);

    // Get some data... slightly different than what we wrote.
    stream.receive({
      msg: 'added',
      collection: collName,
      id: MongoID.idStringify(stubWrittenId),
      fields: {
        foo: 'barb',
        other: 'field',
        other2: 'bla'
      }
    });
    // It doesn't show up yet.
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId), {
      _id: stubWrittenId,
      foo: 'bar',
      baz: 42
    });
    o.expectCallbacks();

    // And get the first method-done. Still no updates to minimongo: we can't
    // quiesce the doc until the second method is done.
    stream.receive({ msg: 'updated', methods: [insertMethodId] });
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId), {
      _id: stubWrittenId,
      foo: 'bar',
      baz: 42
    });
    o.expectCallbacks();

    // More data. Not quite what we wrote. Also ignored for now.
    stream.receive({
      msg: 'changed',
      collection: collName,
      id: MongoID.idStringify(stubWrittenId),
      fields: { baz: 43 },
      cleared: ['other']
    });
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId), {
      _id: stubWrittenId,
      foo: 'bar',
      baz: 42
    });
    o.expectCallbacks();

    // Second data-ready. Now everything takes effect!
    stream.receive({ msg: 'updated', methods: [updateMethodId] });
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId), {
      _id: stubWrittenId,
      foo: 'barb',
      other2: 'bla',
      baz: 43
    });
    o.expectCallbacks({ changed: 1 });

    o.stop();
  });
}

if (Meteor.isClient) {
  Tinytest.add(
    "livedata stub - unsent methods don't block quiescence",
    function(test) {
      // This test is for https://github.com/meteor/meteor/issues/555

      const stream = new StubStream();
      const conn = newConnection(stream);
      startAndConnect(test, stream);

      const collName = Random.id();
      const coll = new Mongo.Collection(collName, { connection: conn });

      conn.methods({
        insertSomething: function() {
          // stub write
          coll.insert({ foo: 'bar' });
        }
      });

      test.equal(coll.find().count(), 0);

      // Call a random method (no-op)
      conn.call('no-op', _.identity);
      // Call a wait method
      conn.apply('no-op', [], { wait: true }, _.identity);
      // Call a method with a stub that writes.
      conn.call('insertSomething', _.identity);

      // Stub write is visible.
      test.equal(coll.find({ foo: 'bar' }).count(), 1);
      const stubWrittenId = coll.findOne({ foo: 'bar' })._id;

      // first method sent
      const firstMethodId = testGotMessage(test, stream, {
        msg: 'method',
        method: 'no-op',
        params: [],
        id: '*'
      }).id;
      test.equal(stream.sent.length, 0);

      // ack the first method
      stream.receive({ msg: 'updated', methods: [firstMethodId] });
      stream.receive({ msg: 'result', id: firstMethodId });

      // Wait method sent.
      const waitMethodId = testGotMessage(test, stream, {
        msg: 'method',
        method: 'no-op',
        params: [],
        id: '*'
      }).id;
      test.equal(stream.sent.length, 0);

      // ack the wait method
      stream.receive({ msg: 'updated', methods: [waitMethodId] });
      stream.receive({ msg: 'result', id: waitMethodId });

      // insert method sent.
      const insertMethodId = testGotMessage(test, stream, {
        msg: 'method',
        method: 'insertSomething',
        params: [],
        id: '*',
        randomSeed: '*'
      }).id;
      test.equal(stream.sent.length, 0);

      // ack the insert method
      stream.receive({ msg: 'updated', methods: [insertMethodId] });
      stream.receive({ msg: 'result', id: insertMethodId });

      // simulation reverted.
      test.equal(coll.find({ foo: 'bar' }).count(), 0);
    }
  );
}
Tinytest.add('livedata stub - reactive resub', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);

  startAndConnect(test, stream);

  const readiedSubs = {};
  const markAllReady = function() {
    // synthesize a "ready" message in response to any "sub"
    // message with an id we haven't seen before
    _.each(stream.sent, function(msg) {
      msg = JSON.parse(msg);
      if (msg.msg === 'sub' && !_.has(readiedSubs, msg.id)) {
        stream.receive({ msg: 'ready', subs: [msg.id] });
        readiedSubs[msg.id] = true;
      }
    });
  };

  const fooArg = new ReactiveVar('A');
  let fooReady = 0;

  let inner;
  const outer = Tracker.autorun(function() {
    inner = Tracker.autorun(function() {
      conn.subscribe('foo-sub', fooArg.get(), function() {
        fooReady++;
      });
    });
  });

  markAllReady();
  let message = JSON.parse(stream.sent.shift());
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'foo-sub', params: ['A'] });
  test.equal(fooReady, 1);

  // Rerun the inner autorun with different subscription
  // arguments.
  fooArg.set('B');
  test.isTrue(inner.invalidated);
  Tracker.flush();
  test.isFalse(inner.invalidated);
  markAllReady();
  message = JSON.parse(stream.sent.shift());
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'foo-sub', params: ['B'] });
  message = JSON.parse(stream.sent.shift());
  delete message.id;
  test.equal(message, { msg: 'unsub' });
  test.equal(fooReady, 2);

  // Rerun inner again with same args; should be no re-sub.
  inner.invalidate();
  test.isTrue(inner.invalidated);
  Tracker.flush();
  test.isFalse(inner.invalidated);
  markAllReady();
  test.isUndefined(stream.sent.shift());
  test.isUndefined(stream.sent.shift());
  test.equal(fooReady, 3);

  // Rerun outer!  Should still be no re-sub even though
  // the inner computation is stopped and a new one is
  // started.
  outer.invalidate();
  test.isTrue(inner.invalidated);
  Tracker.flush();
  test.isFalse(inner.invalidated);
  markAllReady();
  test.isUndefined(stream.sent.shift());
  test.equal(fooReady, 4);

  // Change the subscription.  Now we should get an onReady.
  fooArg.set('C');
  Tracker.flush();
  markAllReady();
  message = JSON.parse(stream.sent.shift());
  delete message.id;
  test.equal(message, { msg: 'sub', name: 'foo-sub', params: ['C'] });
  message = JSON.parse(stream.sent.shift());
  delete message.id;
  test.equal(message, { msg: 'unsub' });
  test.equal(fooReady, 5);
});

Tinytest.add('livedata connection - reactive userId', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);

  test.equal(conn.userId(), null);
  conn.setUserId(1337);
  test.equal(conn.userId(), 1337);
});

Tinytest.add('livedata connection - two wait methods', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);
  startAndConnect(test, stream);

  const collName = Random.id();
  const coll = new Mongo.Collection(collName, { connection: conn });

  // setup method
  conn.methods({ do_something: function(x) {} });

  const responses = [];
  conn.apply('do_something', ['one!'], function() {
    responses.push('one');
  });
  let one_message = JSON.parse(stream.sent.shift());
  test.equal(one_message.params, ['one!']);

  conn.apply('do_something', ['two!'], { wait: true }, function() {
    responses.push('two');
  });
  // 'two!' isn't sent yet, because it's a wait method.
  test.equal(stream.sent.length, 0);

  conn.apply('do_something', ['three!'], function() {
    responses.push('three');
  });
  conn.apply('do_something', ['four!'], function() {
    responses.push('four');
  });

  conn.apply('do_something', ['five!'], { wait: true }, function() {
    responses.push('five');
  });

  conn.apply('do_something', ['six!'], function() {
    responses.push('six');
  });

  // Verify that we did not send any more methods since we are still waiting on
  // 'one!'.
  test.equal(stream.sent.length, 0);

  // Receive some data. "one" is not a wait method and there are no stubs, so it
  // gets applied immediately.
  test.equal(coll.find().count(), 0);
  stream.receive({
    msg: 'added',
    collection: collName,
    id: 'foo',
    fields: { x: 1 }
  });
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('foo'), { _id: 'foo', x: 1 });

  // Let "one!" finish. Both messages are required to fire the callback.
  stream.receive({ msg: 'result', id: one_message.id });
  test.equal(responses, []);
  stream.receive({ msg: 'updated', methods: [one_message.id] });
  test.equal(responses, ['one']);

  // Now we've send out "two!".
  let two_message = JSON.parse(stream.sent.shift());
  test.equal(two_message.params, ['two!']);

  // But still haven't sent "three!".
  test.equal(stream.sent.length, 0);

  // Receive more data. "two" is a wait method, so the data doesn't get applied
  // yet.
  stream.receive({
    msg: 'changed',
    collection: collName,
    id: 'foo',
    fields: { y: 3 }
  });
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('foo'), { _id: 'foo', x: 1 });

  // Let "two!" finish, with its end messages in the opposite order to "one!".
  stream.receive({ msg: 'updated', methods: [two_message.id] });
  test.equal(responses, ['one']);
  test.equal(stream.sent.length, 0);
  // data-done message is enough to allow data to be written.
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('foo'), { _id: 'foo', x: 1, y: 3 });
  stream.receive({ msg: 'result', id: two_message.id });
  test.equal(responses, ['one', 'two']);

  // Verify that we just sent "three!" and "four!" now that we got
  // responses for "one!" and "two!"
  test.equal(stream.sent.length, 2);
  let three_message = JSON.parse(stream.sent.shift());
  test.equal(three_message.params, ['three!']);
  let four_message = JSON.parse(stream.sent.shift());
  test.equal(four_message.params, ['four!']);

  // Out of order response is OK for non-wait methods.
  stream.receive({ msg: 'result', id: three_message.id });
  stream.receive({ msg: 'result', id: four_message.id });
  stream.receive({ msg: 'updated', methods: [four_message.id] });
  test.equal(responses, ['one', 'two', 'four']);
  test.equal(stream.sent.length, 0);

  // Let three finish too.
  stream.receive({ msg: 'updated', methods: [three_message.id] });
  test.equal(responses, ['one', 'two', 'four', 'three']);

  // Verify that we just sent "five!" (the next wait method).
  test.equal(stream.sent.length, 1);
  let five_message = JSON.parse(stream.sent.shift());
  test.equal(five_message.params, ['five!']);
  test.equal(responses, ['one', 'two', 'four', 'three']);

  // Let five finish.
  stream.receive({ msg: 'result', id: five_message.id });
  stream.receive({ msg: 'updated', methods: [five_message.id] });
  test.equal(responses, ['one', 'two', 'four', 'three', 'five']);

  let six_message = JSON.parse(stream.sent.shift());
  test.equal(six_message.params, ['six!']);
});

addReconnectTests(
  'livedata connection - onReconnect prepends messages correctly with a wait method',
  function(test, setOnReconnect) {
    const stream = new StubStream();
    const conn = newConnection(stream);
    startAndConnect(test, stream);

    // setup method
    conn.methods({ do_something: function(x) {} });

    setOnReconnect(conn, function() {
      conn.apply('do_something', ['reconnect zero'], _.identity);
      conn.apply('do_something', ['reconnect one'], _.identity);
      conn.apply('do_something', ['reconnect two'], { wait: true }, _.identity);
      conn.apply('do_something', ['reconnect three'], _.identity);
    });

    conn.apply('do_something', ['one'], _.identity);
    conn.apply('do_something', ['two'], { wait: true }, _.identity);
    conn.apply('do_something', ['three'], _.identity);

    // reconnect
    stream.sent = [];
    stream.reset();
    testGotMessage(test, stream, makeConnectMessage(conn._lastSessionId));

    // Test that we sent what we expect to send, and we're blocked on
    // what we expect to be blocked. The subsequent logic to correctly
    // read the wait flag is tested separately.
    test.equal(
      _.map(stream.sent, function(msg) {
        return JSON.parse(msg).params[0];
      }),
      ['reconnect zero', 'reconnect one']
    );

    // white-box test:
    test.equal(
      _.map(conn._outstandingMethodBlocks, function(block) {
        return [
          block.wait,
          _.map(block.methods, function(method) {
            return method._message.params[0];
          })
        ];
      }),
      [
        [false, ['reconnect zero', 'reconnect one']],
        [true, ['reconnect two']],
        [false, ['reconnect three', 'one']],
        [true, ['two']],
        [false, ['three']]
      ]
    );
  }
);

Tinytest.add('livedata connection - ping without id', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);
  startAndConnect(test, stream);

  stream.receive({ msg: 'ping' });
  testGotMessage(test, stream, { msg: 'pong' });
});

Tinytest.add('livedata connection - ping with id', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);
  startAndConnect(test, stream);

  const id = Random.id();
  stream.receive({ msg: 'ping', id: id });
  testGotMessage(test, stream, { msg: 'pong', id: id });
});

_.each(DDPCommon.SUPPORTED_DDP_VERSIONS, function(version) {
  Tinytest.addAsync('livedata connection - ping from ' + version, function(
    test,
    onComplete
  ) {
    const connection = new Connection(getSelfConnectionUrl(), {
      reloadWithOutstanding: true,
      supportedDDPVersions: [version],
      onDDPVersionNegotiationFailure: function() {
        test.fail();
        onComplete();
      },
      onConnected: function() {
        test.equal(connection._version, version);
        // It's a little naughty to access _stream and _send, but it works...
        connection._stream.on('message', function(json) {
          let msg = JSON.parse(json);
          let done = false;
          if (msg.msg === 'pong') {
            test.notEqual(version, 'pre1');
            done = true;
          } else if (msg.msg === 'error') {
            // Version pre1 does not play ping-pong
            test.equal(version, 'pre1');
            done = true;
          } else {
            Meteor._debug('Got unexpected message: ' + json);
          }
          if (done) {
            connection._stream.disconnect({ _permanent: true });
            onComplete();
          }
        });
        connection._send({ msg: 'ping' });
      }
    });
  });
});

const getSelfConnectionUrl = function() {
  if (Meteor.isClient) {
    let ddpUrl = Meteor._relativeToSiteRootUrl('/');
    if (typeof __meteor_runtime_config__ !== 'undefined') {
      if (__meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL)
        ddpUrl = __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL;
    }
    return ddpUrl;
  } else {
    return Meteor.absoluteUrl();
  }
};

if (Meteor.isServer) {
  Meteor.methods({
    reverse: function(arg) {
      // Return something notably different from reverse.meteor.com.
      return (
        arg
          .split('')
          .reverse()
          .join('') + ' LOCAL'
      );
    }
  });
}

testAsyncMulti('livedata connection - reconnect to a different server', [
  function(test, expect) {
    const self = this;
    self.conn = DDP.connect('reverse.meteor.com');
    pollUntil(
      expect,
      function() {
        return self.conn.status().connected;
      },
      5000,
      100,
      false
    );
  },
  function(test, expect) {
    const self = this;
    self.doTest = self.conn.status().connected;
    if (self.doTest) {
      self.conn.call(
        'reverse',
        'foo',
        expect(function(err, res) {
          test.equal(res, 'oof');
        })
      );
    }
  },
  function(test, expect) {
    const self = this;
    if (self.doTest) {
      self.conn.reconnect({ url: getSelfConnectionUrl() });
      self.conn.call(
        'reverse',
        'bar',
        expect(function(err, res) {
          test.equal(res, 'rab LOCAL');
        })
      );
    }
  }
]);

Tinytest.addAsync(
  'livedata connection - version negotiation requires renegotiating',
  function(test, onComplete) {
    const connection = new Connection(getSelfConnectionUrl(), {
      reloadWithOutstanding: true,
      supportedDDPVersions: ['garbled', DDPCommon.SUPPORTED_DDP_VERSIONS[0]],
      onDDPVersionNegotiationFailure: function() {
        test.fail();
        onComplete();
      },
      onConnected: function() {
        test.equal(connection._version, DDPCommon.SUPPORTED_DDP_VERSIONS[0]);
        connection._stream.disconnect({ _permanent: true });
        onComplete();
      }
    });
  }
);

Tinytest.addAsync('livedata connection - version negotiation error', function(
  test,
  onComplete
) {
  const connection = new Connection(getSelfConnectionUrl(), {
    reloadWithOutstanding: true,
    supportedDDPVersions: ['garbled', 'more garbled'],
    onDDPVersionNegotiationFailure: function() {
      test.equal(connection.status().status, 'failed');
      test.matches(
        connection.status().reason,
        /DDP version negotiation failed/
      );
      test.isFalse(connection.status().connected);
      onComplete();
    },
    onConnected: function() {
      test.fail();
      onComplete();
    }
  });
});

addReconnectTests(
  'livedata connection - onReconnect prepends messages correctly without a wait method',
  function(test, setOnReconnect) {
    const stream = new StubStream();
    const conn = newConnection(stream);
    startAndConnect(test, stream);

    // setup method
    conn.methods({ do_something: function(x) {} });

    setOnReconnect(conn, function() {
      conn.apply('do_something', ['reconnect one'], _.identity);
      conn.apply('do_something', ['reconnect two'], _.identity);
      conn.apply('do_something', ['reconnect three'], _.identity);
    });

    conn.apply('do_something', ['one'], _.identity);
    conn.apply('do_something', ['two'], { wait: true }, _.identity);
    conn.apply('do_something', ['three'], { wait: true }, _.identity);
    conn.apply('do_something', ['four'], _.identity);

    // reconnect
    stream.sent = [];
    stream.reset();
    testGotMessage(test, stream, makeConnectMessage(conn._lastSessionId));

    // Test that we sent what we expect to send, and we're blocked on
    // what we expect to be blocked. The subsequent logic to correctly
    // read the wait flag is tested separately.
    test.equal(
      _.map(stream.sent, function(msg) {
        return JSON.parse(msg).params[0];
      }),
      ['reconnect one', 'reconnect two', 'reconnect three', 'one']
    );

    // white-box test:
    test.equal(
      _.map(conn._outstandingMethodBlocks, function(block) {
        return [
          block.wait,
          _.map(block.methods, function(method) {
            return method._message.params[0];
          })
        ];
      }),
      [
        [false, ['reconnect one', 'reconnect two', 'reconnect three', 'one']],
        [true, ['two']],
        [true, ['three']],
        [false, ['four']]
      ]
    );
  }
);

addReconnectTests(
  'livedata connection - onReconnect with sent messages',
  function(test, setOnReconnect) {
    const stream = new StubStream();
    const conn = newConnection(stream);
    startAndConnect(test, stream);

    // setup method
    conn.methods({ do_something: function(x) {} });

    setOnReconnect(conn, function() {
      conn.apply('do_something', ['login'], { wait: true }, _.identity);
    });

    conn.apply('do_something', ['one'], _.identity);

    // initial connect
    stream.sent = [];
    stream.reset();
    testGotMessage(test, stream, makeConnectMessage(conn._lastSessionId));

    // Test that we sent just the login message.
    const loginId = testGotMessage(test, stream, {
      msg: 'method',
      method: 'do_something',
      params: ['login'],
      id: '*'
    }).id;

    // we connect.
    stream.receive({ msg: 'connected', session: Random.id() });
    test.length(stream.sent, 0);

    // login got result (but not yet data)
    stream.receive({ msg: 'result', id: loginId, result: 'foo' });
    test.length(stream.sent, 0);

    // login got data. now we send next method.
    stream.receive({ msg: 'updated', methods: [loginId] });

    testGotMessage(test, stream, {
      msg: 'method',
      method: 'do_something',
      params: ['one'],
      id: '*'
    }).id;
  }
);

addReconnectTests('livedata stub - reconnect double wait method', function(
  test,
  setOnReconnect
) {
  const stream = new StubStream();
  const conn = newConnection(stream);
  startAndConnect(test, stream);

  const output = [];
  setOnReconnect(conn, function() {
    conn.apply('reconnectMethod', [], { wait: true }, function(err, result) {
      output.push('reconnect');
    });
  });

  conn.apply('halfwayMethod', [], { wait: true }, function(err, result) {
    output.push('halfway');
  });

  test.equal(output, []);
  // Method sent.
  const halfwayId = testGotMessage(test, stream, {
    msg: 'method',
    method: 'halfwayMethod',
    params: [],
    id: '*'
  }).id;
  test.equal(stream.sent.length, 0);

  // Get the result. This means it will not be resent.
  stream.receive({ msg: 'result', id: halfwayId, result: 'bla' });
  // Callback not called.
  test.equal(output, []);

  // Reset stream. halfwayMethod does NOT get resent, but reconnectMethod does!
  // Reconnect quiescence happens when reconnectMethod is done.
  stream.reset();
  testGotMessage(test, stream, makeConnectMessage(SESSION_ID));
  const reconnectId = testGotMessage(test, stream, {
    msg: 'method',
    method: 'reconnectMethod',
    params: [],
    id: '*'
  }).id;
  test.length(stream.sent, 0);
  // Still holding out hope for session resumption, so no callbacks yet.
  test.equal(output, []);

  // Receive 'connected', but reconnect quiescence is blocking on
  // reconnectMethod.
  stream.receive({ msg: 'connected', session: SESSION_ID + 1 });
  test.equal(output, []);

  // Data-done for reconnectMethod. This gets us to reconnect quiescence, so
  // halfwayMethod's callback fires. reconnectMethod's is still waiting on its
  // result.
  stream.receive({ msg: 'updated', methods: [reconnectId] });
  test.equal(output.shift(), 'halfway');
  test.equal(output, []);

  // Get result of reconnectMethod. Its callback fires.
  stream.receive({ msg: 'result', id: reconnectId, result: 'foo' });
  test.equal(output.shift(), 'reconnect');
  test.equal(output, []);

  // Call another method. It should be delivered immediately. This is a
  // regression test for a case where it never got delivered because there was
  // an empty block in _outstandingMethodBlocks blocking it from being sent.
  conn.call('lastMethod', _.identity);
  testGotMessage(test, stream, {
    msg: 'method',
    method: 'lastMethod',
    params: [],
    id: '*'
  });
});

Tinytest.add('livedata stub - subscribe errors', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);

  startAndConnect(test, stream);

  // subscribe
  let onReadyFired = false;
  let subErrorInStopped = null;
  let subErrorInError = null;

  conn.subscribe('unknownSub', {
    onReady: function() {
      onReadyFired = true;
    },

    // We now have two ways to get the error from a subscription:
    // 1. onStop, which is called no matter what when the subscription is
    //    stopped (a lifecycle callback)
    // 2. onError, which is deprecated and is called only if there is an
    //    error
    onStop: function(error) {
      subErrorInStopped = error;
    },
    onError: function(error) {
      subErrorInError = error;
    }
  });

  test.isFalse(onReadyFired);
  test.equal(subErrorInStopped, null);

  // XXX COMPAT WITH 1.0.3.1 #errorCallback
  test.equal(subErrorInError, null);

  let subMessage = JSON.parse(stream.sent.shift());
  test.equal(subMessage, {
    msg: 'sub',
    name: 'unknownSub',
    params: [],
    id: subMessage.id
  });

  // Reject the sub.
  stream.receive({
    msg: 'nosub',
    id: subMessage.id,
    error: new Meteor.Error(404, 'Subscription not found')
  });
  test.isFalse(onReadyFired);

  // Check the error passed to the stopped callback was correct
  test.instanceOf(subErrorInStopped, Meteor.Error);
  test.equal(subErrorInStopped.error, 404);
  test.equal(subErrorInStopped.reason, 'Subscription not found');

  // Check the error passed to the error callback was correct
  // XXX COMPAT WITH 1.0.3.1 #errorCallback
  test.instanceOf(subErrorInError, Meteor.Error);
  test.equal(subErrorInError.error, 404);
  test.equal(subErrorInError.reason, 'Subscription not found');

  // stream reset: reconnect!
  stream.reset();
  // We send a connect.
  testGotMessage(test, stream, makeConnectMessage(SESSION_ID));
  // We should NOT re-sub to the sub, because we processed the error.
  test.length(stream.sent, 0);
  test.isFalse(onReadyFired);
});

Tinytest.add('livedata stub - subscribe stop', function(test) {
  const stream = new StubStream();
  const conn = newConnection(stream);

  startAndConnect(test, stream);

  // subscribe
  let onReadyFired = false;
  let onStopFired = false;
  let subErrorInStopped = null;

  const sub = conn.subscribe('my_data', {
    onStop: function(error) {
      onStopFired = true;
      subErrorInStopped = error;
    }
  });

  test.equal(subErrorInStopped, null);

  sub.stop();

  test.isTrue(onStopFired);
  test.equal(subErrorInStopped, undefined);
});

if (Meteor.isClient) {
  Tinytest.add('livedata stub - stubs before connected', function(test) {
    const stream = new StubStream();
    const conn = newConnection(stream);

    const collName = Random.id();
    const coll = new Mongo.Collection(collName, { connection: conn });

    // Start and send "connect", but DON'T get 'connected' quite yet.
    stream.reset(); // initial connection start.

    testGotMessage(test, stream, makeConnectMessage());
    test.length(stream.sent, 0);

    // Insert a document. The stub updates "conn" directly.
    coll.insert({ _id: 'foo', bar: 42 }, _.identity);
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(), { _id: 'foo', bar: 42 });
    // It also sends the method message.
    let methodMessage = JSON.parse(stream.sent.shift());
    test.isUndefined(methodMessage.randomSeed);
    test.equal(methodMessage, {
      msg: 'method',
      method: '/' + collName + '/insert',
      params: [{ _id: 'foo', bar: 42 }],
      id: methodMessage.id
    });
    test.length(stream.sent, 0);

    // Now receive a connected message. This should not clear the
    // _documentsWrittenByStub state!
    stream.receive({ msg: 'connected', session: SESSION_ID });
    test.length(stream.sent, 0);
    test.equal(coll.find().count(), 1);

    // Now receive the "updated" message for the method. This should revert the
    // insert.
    stream.receive({ msg: 'updated', methods: [methodMessage.id] });
    test.length(stream.sent, 0);
    test.equal(coll.find().count(), 0);
  });
}

if (Meteor.isClient) {
  Tinytest.add(
    'livedata stub - method call between reset and quiescence',
    function(test) {
      const stream = new StubStream();
      const conn = newConnection(stream);

      startAndConnect(test, stream);

      const collName = Random.id();
      const coll = new Mongo.Collection(collName, { connection: conn });

      conn.methods({
        update_value: function() {
          coll.update('aaa', { value: 222 });
        }
      });

      // Set up test subscription.
      const sub = conn.subscribe('test_data');
      let subMessage = JSON.parse(stream.sent.shift());
      test.equal(subMessage, {
        msg: 'sub',
        name: 'test_data',
        params: [],
        id: subMessage.id
      });
      test.length(stream.sent, 0);

      const subDocMessage = {
        msg: 'added',
        collection: collName,
        id: 'aaa',
        fields: { value: 111 }
      };

      const subReadyMessage = { msg: 'ready', subs: [subMessage.id] };

      stream.receive(subDocMessage);
      stream.receive(subReadyMessage);
      test.isTrue(coll.findOne('aaa').value == 111);

      // Initiate reconnect.
      stream.reset();
      testGotMessage(test, stream, makeConnectMessage(SESSION_ID));
      testGotMessage(test, stream, subMessage);
      stream.receive({ msg: 'connected', session: SESSION_ID + 1 });

      // Now in reconnect, can still see the document.
      test.isTrue(coll.findOne('aaa').value == 111);

      conn.call('update_value');

      // Observe the stub-written value.
      test.isTrue(coll.findOne('aaa').value == 222);

      let methodMessage = JSON.parse(stream.sent.shift());
      test.equal(methodMessage, {
        msg: 'method',
        method: 'update_value',
        params: [],
        id: methodMessage.id
      });
      test.length(stream.sent, 0);

      stream.receive(subDocMessage);
      stream.receive(subReadyMessage);

      // By this point quiescence is reached and stores have been reset.

      // The stub-written value is still there.
      test.isTrue(coll.findOne('aaa').value == 222);

      stream.receive({
        msg: 'changed',
        collection: collName,
        id: 'aaa',
        fields: { value: 333 }
      });
      stream.receive({ msg: 'updated', methods: [methodMessage.id] });
      stream.receive({ msg: 'result', id: methodMessage.id, result: null });

      // Server wrote a different value, make sure it's visible now.
      test.isTrue(coll.findOne('aaa').value == 333);
    }
  );

  Tinytest.add('livedata stub - buffering and methods interaction', function(
    test
  ) {
    const stream = new StubStream();
    const conn = newConnection(stream, {
      // A very high values so that all messages are effectively buffered.
      bufferedWritesInterval: 10000,
      bufferedWritesMaxAge: 10000
    });

    startAndConnect(test, stream);

    const collName = Random.id();
    const coll = new Mongo.Collection(collName, { connection: conn });

    conn.methods({
      update_value: function() {
        const value = coll.findOne('aaa').subscription;
        // Method should have access to the latest value of the collection.
        coll.update('aaa', { $set: { method: value + 110 } });
      }
    });

    // Set up test subscription.
    const sub = conn.subscribe('test_data');
    let subMessage = JSON.parse(stream.sent.shift());
    test.equal(subMessage, {
      msg: 'sub',
      name: 'test_data',
      params: [],
      id: subMessage.id
    });
    test.length(stream.sent, 0);

    const subDocMessage = {
      msg: 'added',
      collection: collName,
      id: 'aaa',
      fields: { subscription: 111 }
    };

    const subReadyMessage = { msg: 'ready', subs: [subMessage.id] };

    stream.receive(subDocMessage);
    stream.receive(subReadyMessage);
    test.equal(coll.findOne('aaa').subscription, 111);

    const subDocChangeMessage = {
      msg: 'changed',
      collection: collName,
      id: 'aaa',
      fields: { subscription: 112 }
    };

    stream.receive(subDocChangeMessage);
    // Still 111 because buffer has not been flushed.
    test.equal(coll.findOne('aaa').subscription, 111);

    // Call updates the stub.
    conn.call('update_value');

    // Observe the stub-written value.
    test.equal(coll.findOne('aaa').method, 222);
    // subscription field is updated to the latest value
    // because of the method call.
    test.equal(coll.findOne('aaa').subscription, 112);

    let methodMessage = JSON.parse(stream.sent.shift());
    test.equal(methodMessage, {
      msg: 'method',
      method: 'update_value',
      params: [],
      id: methodMessage.id
    });
    test.length(stream.sent, 0);

    // "Server-side" change from the method arrives and method returns.
    // With potentially fixed value for method field, if stub didn't
    // use 112 as the subscription field value.
    stream.receive({
      msg: 'changed',
      collection: collName,
      id: 'aaa',
      fields: { method: 222 }
    });
    stream.receive({ msg: 'updated', methods: [methodMessage.id] });
    stream.receive({ msg: 'result', id: methodMessage.id, result: null });

    test.equal(coll.findOne('aaa').method, 222);
    test.equal(coll.findOne('aaa').subscription, 112);

    // Buffer should already be flushed because of a non-update message.
    // And after a flush we really want subscription field to be 112.
    conn._flushBufferedWrites();
    test.equal(coll.findOne('aaa').method, 222);
    test.equal(coll.findOne('aaa').subscription, 112);
  });
}

// XXX also test:
// - reconnect, with session resume.
// - restart on update flag
// - on_update event
// - reloading when the app changes, including session migration
