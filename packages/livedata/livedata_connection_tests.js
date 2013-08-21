var newConnection = function (stream) {
  // Some of these tests leave outstanding methods with no result yet
  // returned. This should not block us from re-running tests when sources
  // change.
  return new LivedataTest.Connection(stream, {reloadWithOutstanding: true});
};

var makeConnectMessage = function (session) {
  var msg = {
    msg: 'connect',
    version: LivedataTest.SUPPORTED_DDP_VERSIONS[0],
    support: LivedataTest.SUPPORTED_DDP_VERSIONS
  };

  if (session)
    msg.session = session;
  return msg;
}

var testGotMessage = function (test, stream, expected) {
  var retVal = undefined;

  if (stream.sent.length === 0) {
    test.fail({error: 'no message received', expected: expected});
    return retVal;
  }

  var got = stream.sent.shift();

  if (typeof got === 'string' && typeof expected === 'object')
    got = JSON.parse(got);

  // An expected value of '*' matches any value, and the matching value (or
  // array of matching values, if there are multiple) is returned from this
  // function.
  if (typeof expected === 'object') {
    var keysWithStarValues = [];
    _.each(expected, function (v, k) {
      if (v === '*')
        keysWithStarValues.push(k);
    });
    _.each(keysWithStarValues, function (k) {
      expected[k] = got[k];
    });
    if (keysWithStarValues.length === 1) {
      retVal = got[keysWithStarValues[0]];
    } else {
      retVal = _.map(keysWithStarValues, function (k) {
        return got[k];
      });
    }
  }

  test.equal(got, expected);
  return retVal;
};

var startAndConnect = function(test, stream) {
  stream.reset(); // initial connection start.

  testGotMessage(test, stream, makeConnectMessage());
  test.length(stream.sent, 0);

  stream.receive({msg: 'connected', session: SESSION_ID});
  test.length(stream.sent, 0);
};

var SESSION_ID = '17';

Tinytest.add("livedata stub - receive data", function (test) {
  var stream = new StubStream();
  var conn = newConnection(stream);

  startAndConnect(test, stream);

  // data comes in for unknown collection.
  var coll_name = Random.id();
  stream.receive({msg: 'added', collection: coll_name, id: '1234',
                  fields: {a: 1}});
  // break throught the black box and test internal state
  test.length(conn._updatesForUnknownStores[coll_name], 1);

  // XXX: Test that the old signature of passing manager directly instead of in
  // options works.
  var coll = new Meteor.Collection(coll_name, conn);

  // queue has been emptied and doc is in db.
  test.isUndefined(conn._updatesForUnknownStores[coll_name]);
  test.equal(coll.find({}).fetch(), [{_id:'1234', a:1}]);

  // second message. applied directly to the db.
  stream.receive({msg: 'changed', collection: coll_name, id: '1234',
                  fields: {a:2}});
  test.equal(coll.find({}).fetch(), [{_id:'1234', a:2}]);
  test.isUndefined(conn._updatesForUnknownStores[coll_name]);
});

Tinytest.add("livedata stub - subscribe", function (test) {
  var stream = new StubStream();
  var conn = newConnection(stream);

  startAndConnect(test, stream);

  // subscribe
  var callback_fired = false;
  var sub = conn.subscribe('my_data', function () {
    callback_fired = true;
  });
  test.isFalse(callback_fired);

  test.length(stream.sent, 1);
  var message = JSON.parse(stream.sent.shift());
  var id = message.id;
  delete message.id;
  test.equal(message, {msg: 'sub', name: 'my_data', params: []});

  var reactivelyReady = false;
  var autorunHandle = Deps.autorun(function () {
    reactivelyReady = sub.ready();
  });
  test.isFalse(reactivelyReady);

  // get the sub satisfied. callback fires.
  stream.receive({msg: 'ready', 'subs': [id]});
  test.isTrue(callback_fired);
  Deps.flush();
  test.isTrue(reactivelyReady);
  autorunHandle.stop();

  // Unsubscribe.
  sub.stop();
  test.length(stream.sent, 1);
  message = JSON.parse(stream.sent.shift());
  test.equal(message, {msg: 'unsub', id: id});

  // Resubscribe.
  conn.subscribe('my_data');
  test.length(stream.sent, 1);
  message = JSON.parse(stream.sent.shift());
  var id2 = message.id;
  test.notEqual(id, id2);
  delete message.id;
  test.equal(message, {msg: 'sub', name: 'my_data', params: []});
});


Tinytest.add("livedata stub - reactive subscribe", function (test) {
  var stream = new StubStream();
  var conn = newConnection(stream);

  startAndConnect(test, stream);

  var rFoo = new ReactiveVar('foo1');
  var rBar = new ReactiveVar('bar1');

  var onReadyCount = {};
  var onReady = function (tag) {
    return function () {
      if (_.has(onReadyCount, tag))
        ++onReadyCount[tag];
      else
        onReadyCount[tag] = 1;
    };
  };

  // Subscribe to some subs.
  var stopperHandle;
  var autorunHandle = Deps.autorun(function () {
    conn.subscribe("foo", rFoo.get(), onReady(rFoo.get()));
    conn.subscribe("bar", rBar.get(), onReady(rBar.get()));
    conn.subscribe("completer", onReady("completer"));
    stopperHandle = conn.subscribe("stopper", onReady("stopper"));
  });

  // Check sub messages. (Assume they are sent in the order executed.)
  test.length(stream.sent, 4);
  var message = JSON.parse(stream.sent.shift());
  var idFoo1 = message.id;
  delete message.id;
  test.equal(message, {msg: 'sub', name: 'foo', params: ['foo1']});

  message = JSON.parse(stream.sent.shift());
  var idBar1 = message.id;
  delete message.id;
  test.equal(message, {msg: 'sub', name: 'bar', params: ['bar1']});

  message = JSON.parse(stream.sent.shift());
  var idCompleter = message.id;
  delete message.id;
  test.equal(message, {msg: 'sub', name: 'completer', params: []});

  message = JSON.parse(stream.sent.shift());
  var idStopper = message.id;
  delete message.id;
  test.equal(message, {msg: 'sub', name: 'stopper', params: []});

  // Haven't hit onReady yet.
  test.equal(onReadyCount, {});

  // "completer" gets ready now. its callback should fire.
  stream.receive({msg: 'ready', 'subs': [idCompleter]});
  test.equal(onReadyCount, {completer: 1});
  test.length(stream.sent, 0);

  // Stop 'stopper'.
  stopperHandle.stop();
  test.length(stream.sent, 1);
  message = JSON.parse(stream.sent.shift());
  test.equal(message, {msg: 'unsub', id: idStopper});

  test.equal(onReadyCount, {completer: 1});

  // Change the foo subscription and flush. We should sub to the new foo
  // subscription, re-sub to the stopper subscription, and then unsub from the old
  // foo subscription.  The bar subscription should be unaffected. The completer
  // subscription should *NOT* call its new onReady callback, because we only
  // call at most one onReady for a given reactively-saved subscription.
  rFoo.set("foo2");
  Deps.flush();
  test.length(stream.sent, 3);

  message = JSON.parse(stream.sent.shift());
  var idFoo2 = message.id;
  delete message.id;
  test.equal(message, {msg: 'sub', name: 'foo', params: ['foo2']});

  message = JSON.parse(stream.sent.shift());
  var idStopperAgain = message.id;
  delete message.id;
  test.equal(message, {msg: 'sub', name: 'stopper', params: []});

  message = JSON.parse(stream.sent.shift());
  test.equal(message, {msg: 'unsub', id: idFoo1});

  test.equal(onReadyCount, {completer: 1});

  // Ready the stopper and bar subs. Completing stopper should call only the
  // onReady from the new subscription because they were separate subscriptions
  // started at different times and the first one was explicitly torn down by
  // the client; completing bar should call only the onReady from the new
  // subscription because we only call at most one onReady per reactively-saved
  // subscription.
  stream.receive({msg: 'ready', 'subs': [idStopperAgain, idBar1]});
  test.equal(onReadyCount, {completer: 1, bar1: 1, stopper: 1});

  // Shut down the autorun. This should unsub us from all current subs at flush
  // time.
  autorunHandle.stop();
  Deps.flush();

  test.length(stream.sent, 4);
  // The order of unsubs here is not important.
  var unsubMessages = _.map(stream.sent, JSON.parse);
  stream.sent.length = 0;
  test.equal(_.unique(_.pluck(unsubMessages, 'msg')), ['unsub']);
  var actualIds = _.pluck(unsubMessages, 'id');
  var expectedIds = [idFoo2, idBar1, idCompleter, idStopperAgain];
  actualIds.sort();
  expectedIds.sort();
  test.equal(actualIds, expectedIds);
});


Tinytest.add("livedata stub - this", function (test) {
  var stream = new StubStream();
  var conn = newConnection(stream);

  startAndConnect(test, stream);
  conn.methods({test_this: function() {
    test.isTrue(this.isSimulation);
    this.unblock(); // should be a no-op
  }});

  // should throw no exceptions
  conn.call('test_this', _.identity);
  // satisfy method, quiesce connection
  var message = JSON.parse(stream.sent.shift());
  test.equal(message, {msg: 'method', method: 'test_this',
                       params: [], id:message.id});
  test.length(stream.sent, 0);

  stream.receive({msg: 'result', id:message.id, result:null});
  stream.receive({msg: 'updated', 'methods': [message.id]});

});

if (Meteor.isClient) {
  Tinytest.add("livedata stub - methods", function (test) {
    var stream = new StubStream();
    var conn = newConnection(stream);

    startAndConnect(test, stream);

    var collName = Random.id();
    var coll = new Meteor.Collection(collName, {connection: conn});

    // setup method
    conn.methods({do_something: function (x) {
      coll.insert({value: x});
    }});

    // setup observers
    var counts = {added: 0, removed: 0, changed: 0, moved: 0};
    var handle = coll.find({}).observe(
      { addedAt: function () { counts.added += 1; },
        removedAt: function () { counts.removed += 1; },
        changedAt: function () { counts.changed += 1; },
        movedTo: function () { counts.moved += 1; }
      });


    // call method with results callback
    var callback1Fired = false;
    conn.call('do_something', 'friday!', function (err, res) {
      test.isUndefined(err);
      test.equal(res, '1234');
      callback1Fired = true;
    });
    test.isFalse(callback1Fired);

    // observers saw the method run.
    test.equal(counts, {added: 1, removed: 0, changed: 0, moved: 0});

    // get response from server
    var message = JSON.parse(stream.sent.shift());
    test.equal(message, {msg: 'method', method: 'do_something',
                         params: ['friday!'], id:message.id});

    test.equal(coll.find({}).count(), 1);
    test.equal(coll.find({value: 'friday!'}).count(), 1);
    var docId = coll.findOne({value: 'friday!'})._id;

    // results does not yet result in callback, because data is not
    // ready.
    stream.receive({msg: 'result', id:message.id, result: "1234"});
    test.isFalse(callback1Fired);

    // result message doesn't affect data
    test.equal(coll.find({}).count(), 1);
    test.equal(coll.find({value: 'friday!'}).count(), 1);
    test.equal(counts, {added: 1, removed: 0, changed: 0, moved: 0});

    // data methods do not show up (not quiescent yet)
    stream.receive({msg: 'added', collection: collName, id: LocalCollection._idStringify(docId),
                    fields: {value: 'tuesday'}});
    test.equal(coll.find({}).count(), 1);
    test.equal(coll.find({value: 'friday!'}).count(), 1);
    test.equal(counts, {added: 1, removed: 0, changed: 0, moved: 0});

    // send another methods (unknown on client)
    var callback2Fired = false;
    conn.call('do_something_else', 'monday', function (err, res) {
      callback2Fired = true;
    });
    test.isFalse(callback1Fired);
    test.isFalse(callback2Fired);

    // test we still send a method request to server
    var message2 = JSON.parse(stream.sent.shift());
    test.equal(message2, {msg: 'method', method: 'do_something_else',
                          params: ['monday'], id: message2.id});

    // get the first data satisfied message. changes are applied to database even
    // though another method is outstanding, because the other method didn't have
    // a stub. and its callback is called.
    stream.receive({msg: 'updated', 'methods': [message.id]});
    test.isTrue(callback1Fired);
    test.isFalse(callback2Fired);

    test.equal(coll.find({}).count(), 1);
    test.equal(coll.find({value: 'tuesday'}).count(), 1);
    test.equal(counts, {added: 1, removed: 0, changed: 1, moved: 0});

    // second result
    stream.receive({msg: 'result', id:message2.id, result:"bupkis"});
    test.isFalse(callback2Fired);

    // get second satisfied; no new changes are applied.
    stream.receive({msg: 'updated', 'methods': [message2.id]});
    test.isTrue(callback2Fired);

    test.equal(coll.find({}).count(), 1);
    test.equal(coll.find({value: 'tuesday', _id: docId}).count(), 1);
    test.equal(counts, {added: 1, removed: 0, changed: 1, moved: 0});

    handle.stop();
  });
}

Tinytest.add("livedata stub - mutating method args", function (test) {
  var stream = new StubStream();
  var conn = newConnection(stream);

  startAndConnect(test, stream);

  conn.methods({mutateArgs: function (arg) {
    arg.foo = 42;
  }});

  conn.call('mutateArgs', {foo: 50}, _.identity);

  // Method should be called with original arg, not mutated arg.
  var message = JSON.parse(stream.sent.shift());
  test.equal(message, {msg: 'method', method: 'mutateArgs',
                       params: [{foo: 50}], id: message.id});
  test.length(stream.sent, 0);
});

var observeCursor = function (test, cursor) {
  var counts = {added: 0, removed: 0, changed: 0, moved: 0};
  var expectedCounts = _.clone(counts);
  var handle = cursor.observe(
    { addedAt: function () { counts.added += 1; },
      removedAt: function () { counts.removed += 1; },
      changedAt: function () { counts.changed += 1; },
      movedTo: function () { counts.moved += 1; }
    });
  return {
    stop: _.bind(handle.stop, handle),
    expectCallbacks: function (delta) {
      _.each(delta, function (mod, field) {
        expectedCounts[field] += mod;
      });
      test.equal(counts, expectedCounts);
    }
  };
};

// method calls another method in simulation. see not sent.
if (Meteor.isClient) {
  Tinytest.add("livedata stub - methods calling methods", function (test) {
    var stream = new StubStream();
    var conn = newConnection(stream);

    startAndConnect(test, stream);

    var coll_name = Random.id();
    var coll = new Meteor.Collection(coll_name, {connection: conn});

    // setup methods
    conn.methods({
      do_something: function () {
        conn.call('do_something_else');
      },
      do_something_else: function () {
        coll.insert({a: 1});
      }
    });

    var o = observeCursor(test, coll.find());

    // call method.
    conn.call('do_something', _.identity);

    // see we only send message for outer methods
    var message = JSON.parse(stream.sent.shift());
    test.equal(message, {msg: 'method', method: 'do_something',
                         params: [], id:message.id});
    test.length(stream.sent, 0);

    // but inner method runs locally.
    o.expectCallbacks({added: 1});
    test.equal(coll.find().count(), 1);
    var docId = coll.findOne()._id;
    test.equal(coll.findOne(), {_id: docId, a: 1});

    // we get the results
    stream.receive({msg: 'result', id:message.id, result:"1234"});

    // get data from the method. data from this doc does not show up yet, but data
    // from another doc does.
    stream.receive({msg: 'added', collection: coll_name, id: LocalCollection._idStringify(docId),
                    fields: {value: 'tuesday'}});
    o.expectCallbacks();
    test.equal(coll.findOne(docId), {_id: docId, a: 1});
    stream.receive({msg: 'added', collection: coll_name, id: 'monkey',
                    fields: {value: 'bla'}});
    o.expectCallbacks({added: 1});
    test.equal(coll.findOne(docId), {_id: docId, a: 1});
    var newDoc = coll.findOne({value: 'bla'});
    test.isTrue(newDoc);
    test.equal(newDoc, {_id: newDoc._id, value: 'bla'});

    // get method satisfied. all data shows up. the 'a' field is reverted and
    // 'value' field is set.
    stream.receive({msg: 'updated', 'methods': [message.id]});
    o.expectCallbacks({changed: 1});
    test.equal(coll.findOne(docId), {_id: docId, value: 'tuesday'});
    test.equal(coll.findOne(newDoc._id), {_id: newDoc._id, value: 'bla'});

    o.stop();
  });
}
Tinytest.add("livedata stub - method call before connect", function (test) {
  var stream = new StubStream;
  var conn = newConnection(stream);

  var callbackOutput = [];
  conn.call('someMethod', function (err, result) {
    callbackOutput.push(result);
  });
  test.equal(callbackOutput, []);

  // the real stream drops all output pre-connection
  stream.sent.length = 0;

  // Now connect.
  stream.reset();

  testGotMessage(test, stream, makeConnectMessage());
  testGotMessage(test, stream, {msg: 'method', method: 'someMethod',
                                params: [], id: '*'});
});

Tinytest.add("livedata stub - reconnect", function (test) {
  var stream = new StubStream();
  var conn = newConnection(stream);

  startAndConnect(test, stream);

  var collName = Random.id();
  var coll = new Meteor.Collection(collName, {connection: conn});

  var o = observeCursor(test, coll.find());

  // subscribe
  var subCallbackFired = false;
  var sub = conn.subscribe('my_data', function () {
    subCallbackFired = true;
  });
  test.isFalse(subCallbackFired);

  var subMessage = JSON.parse(stream.sent.shift());
  test.equal(subMessage, {msg: 'sub', name: 'my_data', params: [],
                          id: subMessage.id});

  // get some data. it shows up.
  stream.receive({msg: 'added', collection: collName,
                  id: '1234', fields: {a:1}});

  test.equal(coll.find({}).count(), 1);
  o.expectCallbacks({added: 1});
  test.isFalse(subCallbackFired);

  stream.receive({msg: 'changed', collection: collName,
                  id: '1234', fields: {b:2}});
  stream.receive({msg: 'ready',
                  subs: [subMessage.id] // satisfy sub
                 });
  test.isTrue(subCallbackFired);
  subCallbackFired = false; // re-arm for test that it doesn't fire again.

  test.equal(coll.find({a:1, b:2}).count(), 1);
  o.expectCallbacks({changed: 1});

  // call method.
  var methodCallbackFired = false;
  conn.call('do_something', function () {
    methodCallbackFired = true;
  });

  conn.apply('do_something_else', [], {wait: true}, _.identity);
  conn.apply('do_something_later', [], _.identity);

  test.isFalse(methodCallbackFired);

  // The non-wait method should send, but not the wait method.
  var methodMessage = JSON.parse(stream.sent.shift());
  test.equal(methodMessage, {msg: 'method', method: 'do_something',
                             params: [], id:methodMessage.id});
  test.equal(stream.sent.length, 0);

  // more data. shows up immediately because there was no relevant method stub.
  stream.receive({msg: 'changed', collection: collName,
                  id: '1234', fields: {c:3}});
  test.equal(coll.findOne('1234'), {_id: '1234', a: 1, b: 2, c: 3});
  o.expectCallbacks({changed: 1});

  // stream reset. reconnect!  we send a connect, our pending method, and our
  // sub. The wait method still is blocked.
  stream.reset();

  testGotMessage(test, stream, makeConnectMessage(SESSION_ID));
  testGotMessage(test, stream, methodMessage);
  testGotMessage(test, stream, subMessage);

  // reconnect with different session id
  stream.receive({msg: 'connected', session: SESSION_ID + 1});

  // resend data. doesn't show up: we're in reconnect quiescence.
  stream.receive({msg: 'added', collection: collName,
                  id: '1234', fields: {a:1, b:2, c:3, d: 4}});
  stream.receive({msg: 'added', collection: collName,
                  id: '2345', fields: {e: 5}});
  test.equal(coll.findOne('1234'), {_id: '1234', a: 1, b: 2, c: 3});
  test.isFalse(coll.findOne('2345'));
  o.expectCallbacks();

  // satisfy and return the method
  stream.receive({msg: 'updated',
                  methods: [methodMessage.id]});
  test.isFalse(methodCallbackFired);
  stream.receive({msg: 'result', id:methodMessage.id, result:"bupkis"});
  // The callback still doesn't fire (and we don't send the wait method): we're
  // still in global quiescence
  test.isFalse(methodCallbackFired);
  test.equal(stream.sent.length, 0);

  // still no update.
  test.equal(coll.findOne('1234'), {_id: '1234', a: 1, b: 2, c: 3});
  test.isFalse(coll.findOne('2345'));
  o.expectCallbacks();

  // re-satisfy sub
  stream.receive({msg: 'ready', subs: [subMessage.id]});

  // now the doc changes and method callback is called, and the wait method is
  // sent. the sub callback isn't re-called.
  test.isTrue(methodCallbackFired);
  test.isFalse(subCallbackFired);
  test.equal(coll.findOne('1234'), {_id: '1234', a: 1, b: 2, c: 3, d: 4});
  test.equal(coll.findOne('2345'), {_id: '2345', e: 5});
  o.expectCallbacks({added: 1, changed: 1});

  var waitMethodMessage = JSON.parse(stream.sent.shift());
  test.equal(waitMethodMessage, {msg: 'method', method: 'do_something_else',
                                 params: [], id: waitMethodMessage.id});
  test.equal(stream.sent.length, 0);
  stream.receive({msg: 'result', id: waitMethodMessage.id, result: "bupkis"});
  test.equal(stream.sent.length, 0);
  stream.receive({msg: 'updated', methods: [waitMethodMessage.id]});

  // wait method done means we can send the third method
  test.equal(stream.sent.length, 1);
  var laterMethodMessage = JSON.parse(stream.sent.shift());
  test.equal(laterMethodMessage, {msg: 'method', method: 'do_something_later',
                                  params: [], id: laterMethodMessage.id});

  o.stop();
});


if (Meteor.isClient) {
  Tinytest.add("livedata stub - reconnect method which only got result", function (test) {
    var stream = new StubStream;
    var conn = newConnection(stream);
    startAndConnect(test, stream);

    var collName = Random.id();
    var coll = new Meteor.Collection(collName, {connection: conn});
    var o = observeCursor(test, coll.find());

    conn.methods({writeSomething: function () {
      // stub write
      coll.insert({foo: 'bar'});
    }});

    test.equal(coll.find({foo: 'bar'}).count(), 0);

    // Call a method. We'll get the result but not data-done before reconnect.
    var callbackOutput = [];
    var onResultReceivedOutput = [];
    conn.apply('writeSomething', [],
               {onResultReceived: function (err, result) {
                 onResultReceivedOutput.push(result);
               }},
               function (err, result) {
                 callbackOutput.push(result);
               });
    // Stub write is visible.
    test.equal(coll.find({foo: 'bar'}).count(), 1);
    var stubWrittenId = coll.findOne({foo: 'bar'})._id;
    o.expectCallbacks({added: 1});
    // Callback not called.
    test.equal(callbackOutput, []);
    test.equal(onResultReceivedOutput, []);
    // Method sent.
    var methodId = testGotMessage(
      test, stream, {msg: 'method', method: 'writeSomething',
                     params: [], id: '*'});
    test.equal(stream.sent.length, 0);

    // Get some data.
    stream.receive({msg: 'added', collection: collName,
                    id: LocalCollection._idStringify(stubWrittenId), fields: {baz: 42}});
    // It doesn't show up yet.
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId), {_id: stubWrittenId, foo: 'bar'});
    o.expectCallbacks();

    // Get the result.
    stream.receive({msg: 'result', id: methodId, result: 'bla'});
    // Data unaffected.
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId), {_id: stubWrittenId, foo: 'bar'});
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
    test.equal(coll.findOne(stubWrittenId), {_id: stubWrittenId, foo: 'bar'});
    o.expectCallbacks();
    test.equal(callbackOutput, []);

    // Receive 'connected': time for reconnect quiescence! Data gets updated
    // locally (ie, data is reset) and callback gets called.
    stream.receive({msg: 'connected', session: SESSION_ID + 1});
    test.equal(coll.find().count(), 0);
    o.expectCallbacks({removed: 1});
    test.equal(callbackOutput, ['bla']);
    test.equal(onResultReceivedOutput, ['bla']);
    stream.receive({msg: 'added', collection: collName,
                    id: LocalCollection._idStringify(stubWrittenId), fields: {baz: 42}});
    test.equal(coll.findOne(stubWrittenId), {_id: stubWrittenId, baz: 42});
    o.expectCallbacks({added: 1});




    // Run method again. We're going to do the same thing this time, except we're
    // also going to use an onReconnect to insert another method at reconnect
    // time, which will delay reconnect quiescence.
    conn.apply('writeSomething', [],
               {onResultReceived: function (err, result) {
                 onResultReceivedOutput.push(result);
               }},
               function (err, result) {
                 callbackOutput.push(result);
               });
    // Stub write is visible.
    test.equal(coll.find({foo: 'bar'}).count(), 1);
    var stubWrittenId2 = coll.findOne({foo: 'bar'})._id;
    o.expectCallbacks({added: 1});
    // Callback not called.
    test.equal(callbackOutput, ['bla']);
    test.equal(onResultReceivedOutput, ['bla']);
    // Method sent.
    var methodId2 = testGotMessage(
      test, stream, {msg: 'method', method: 'writeSomething',
                     params: [], id: '*'});
    test.equal(stream.sent.length, 0);

    // Get some data.
    stream.receive({msg: 'added', collection: collName,
                    id: LocalCollection._idStringify(stubWrittenId2), fields: {baz: 42}});
    // It doesn't show up yet.
    test.equal(coll.find().count(), 2);
    test.equal(coll.findOne(stubWrittenId2), {_id: stubWrittenId2, foo: 'bar'});
    o.expectCallbacks();

    // Get the result.
    stream.receive({msg: 'result', id: methodId2, result: 'blab'});
    // Data unaffected.
    test.equal(coll.find().count(), 2);
    test.equal(coll.findOne(stubWrittenId2), {_id: stubWrittenId2, foo: 'bar'});
    o.expectCallbacks();
    // Callback not called, but onResultReceived is.
    test.equal(callbackOutput, ['bla']);
    test.equal(onResultReceivedOutput, ['bla', 'blab']);
    conn.onReconnect = function () {
      conn.call('slowMethod', function (err, result) {
        callbackOutput.push(result);
      });
    };

    // Reset stream. Method does NOT get resent, because its result is already in,
    // but slowMethod gets called via onReconnect. Reconnect quiescence is now
    // blocking on slowMethod.
    stream.reset();
    testGotMessage(test, stream, makeConnectMessage(SESSION_ID + 1));
    var slowMethodId = testGotMessage(
      test, stream,
      {msg: 'method', method: 'slowMethod', params: [], id: '*'});
    // Still holding out hope for session resumption, so nothing updated yet.
    test.equal(coll.find().count(), 2);
    test.equal(coll.findOne(stubWrittenId2), {_id: stubWrittenId2, foo: 'bar'});
    o.expectCallbacks();
    test.equal(callbackOutput, ['bla']);

    // Receive 'connected'... but no reconnect quiescence yet due to slowMethod.
    stream.receive({msg: 'connected', session: SESSION_ID + 2});
    test.equal(coll.find().count(), 2);
    test.equal(coll.findOne(stubWrittenId2), {_id: stubWrittenId2, foo: 'bar'});
    o.expectCallbacks();
    test.equal(callbackOutput, ['bla']);

    // Receive data matching our stub. It doesn't take effect yet.
    stream.receive({msg: 'added', collection: collName,
                    id: LocalCollection._idStringify(stubWrittenId2), fields: {foo: 'bar'}});
    o.expectCallbacks();

    // slowMethod is done writing, so we get full reconnect quiescence (but no
    // slowMethod callback)... ie, a reset followed by applying the data we just
    // got, as well as calling the callback from the method that half-finished
    // before reset. The net effect is deleting doc 'stubWrittenId'.
    stream.receive({msg: 'updated', methods: [slowMethodId]});
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId2), {_id: stubWrittenId2, foo: 'bar'});
    o.expectCallbacks({removed: 1});
    test.equal(callbackOutput, ['bla', 'blab']);

    // slowMethod returns a value now.
    stream.receive({msg: 'result', id: slowMethodId, result: 'slow'});
    o.expectCallbacks();
    test.equal(callbackOutput, ['bla', 'blab', 'slow']);

    o.stop();
  });
}
Tinytest.add("livedata stub - reconnect method which only got data", function (test) {
  var stream = new StubStream;
  var conn = newConnection(stream);
  startAndConnect(test, stream);

  var collName = Random.id();
  var coll = new Meteor.Collection(collName, {connection: conn});
  var o = observeCursor(test, coll.find());

  // Call a method. We'll get the data-done message but not the result before
  // reconnect.
  var callbackOutput = [];
  var onResultReceivedOutput = [];
  conn.apply('doLittle', [],
             {onResultReceived: function (err, result) {
               onResultReceivedOutput.push(result);
             }},
             function (err, result) {
               callbackOutput.push(result);
             });
  // Callbacks not called.
  test.equal(callbackOutput, []);
  test.equal(onResultReceivedOutput, []);
  // Method sent.
  var methodId = testGotMessage(
    test, stream, {msg: 'method', method: 'doLittle',
                   params: [], id: '*'});
  test.equal(stream.sent.length, 0);

  // Get some data.
  stream.receive({msg: 'added', collection: collName,
                  id: 'photo', fields: {baz: 42}});
  // It shows up instantly because the stub didn't write anything.
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('photo'), {_id: 'photo', baz: 42});
  o.expectCallbacks({added: 1});

  // Get the data-done message.
  stream.receive({msg: 'updated', methods: [methodId]});
  // Data still here.
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('photo'), {_id: 'photo', baz: 42});
  o.expectCallbacks();
  // Method callback not called yet (no result yet).
  test.equal(callbackOutput, []);
  test.equal(onResultReceivedOutput, []);

  // Reset stream. Method gets resent (with same ID), and blocks reconnect
  // quiescence.
  stream.reset();
  testGotMessage(test, stream, makeConnectMessage(SESSION_ID));
  testGotMessage(
    test, stream, {msg: 'method', method: 'doLittle',
                   params: [], id: methodId});
  // Still holding out hope for session resumption, so nothing updated yet.
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('photo'), {_id: 'photo', baz: 42});
  o.expectCallbacks();
  test.equal(callbackOutput, []);
  test.equal(onResultReceivedOutput, []);

  // Receive 'connected'. Still blocking on reconnect quiescence.
  stream.receive({msg: 'connected', session: SESSION_ID + 1});
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('photo'), {_id: 'photo', baz: 42});
  o.expectCallbacks();
  test.equal(callbackOutput, []);
  test.equal(onResultReceivedOutput, []);

  // Receive method result. onResultReceived is called but the main callback
  // isn't (ie, we don't get confused by the fact that we got data-done the
  // *FIRST* time through).
  stream.receive({msg: 'result', id: methodId, result: 'res'});
  test.equal(callbackOutput, []);
  test.equal(onResultReceivedOutput, ['res']);

  // Now we get data-done. Collection is reset and callback is called.
  stream.receive({msg: 'updated', methods: [methodId]});
  test.equal(coll.find().count(), 0);
  o.expectCallbacks({removed: 1});
  test.equal(callbackOutput, ['res']);
  test.equal(onResultReceivedOutput, ['res']);

  o.stop();
});
if (Meteor.isClient) {
  Tinytest.add("livedata stub - multiple stubs same doc", function (test) {
    var stream = new StubStream;
    var conn = newConnection(stream);
    startAndConnect(test, stream);

    var collName = Random.id();
    var coll = new Meteor.Collection(collName, {connection: conn});
    var o = observeCursor(test, coll.find());

    conn.methods({
      insertSomething: function () {
        // stub write
        coll.insert({foo: 'bar'});
      },
      updateIt: function (id) {
        coll.update(id, {$set: {baz: 42}});
      }
    });

    test.equal(coll.find().count(), 0);

    // Call the insert method.
    conn.call('insertSomething', _.identity);
    // Stub write is visible.
    test.equal(coll.find({foo: 'bar'}).count(), 1);
    var stubWrittenId = coll.findOne({foo: 'bar'})._id;
    o.expectCallbacks({added: 1});
    // Method sent.
    var insertMethodId = testGotMessage(
      test, stream, {msg: 'method', method: 'insertSomething',
                     params: [], id: '*'});
    test.equal(stream.sent.length, 0);

    // Call update method.
    conn.call('updateIt', stubWrittenId, _.identity);
    // This stub write is visible too.
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId),
               {_id: stubWrittenId, foo: 'bar', baz: 42});
    o.expectCallbacks({changed: 1});
    // Method sent.
    var updateMethodId = testGotMessage(
      test, stream, {msg: 'method', method: 'updateIt',
                     params: [stubWrittenId], id: '*'});
    test.equal(stream.sent.length, 0);

    // Get some data... slightly different than what we wrote.
    stream.receive({msg: 'added', collection: collName,
                    id: LocalCollection._idStringify(stubWrittenId), fields: {foo: 'barb', other: 'field',
                                                                    other2: 'bla'}});
    // It doesn't show up yet.
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId),
               {_id: stubWrittenId, foo: 'bar', baz: 42});
    o.expectCallbacks();

    // And get the first method-done. Still no updates to minimongo: we can't
    // quiesce the doc until the second method is done.
    stream.receive({msg: 'updated', methods: [insertMethodId]});
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId),
               {_id: stubWrittenId, foo: 'bar', baz: 42});
    o.expectCallbacks();

    // More data. Not quite what we wrote. Also ignored for now.
    stream.receive({msg: 'changed', collection: collName,
                    id: LocalCollection._idStringify(stubWrittenId), fields: {baz: 43}, cleared: ['other']});
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId),
               {_id: stubWrittenId, foo: 'bar', baz: 42});
    o.expectCallbacks();

    // Second data-ready. Now everything takes effect!
    stream.receive({msg: 'updated', methods: [updateMethodId]});
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(stubWrittenId),
               {_id: stubWrittenId, foo: 'barb', other2: 'bla',
                baz: 43});
    o.expectCallbacks({changed: 1});

    o.stop();
  });
}

if (Meteor.isClient) {
  Tinytest.add("livedata stub - unsent methods don't block quiescence", function (test) {
    // This test is for https://github.com/meteor/meteor/issues/555

    var stream = new StubStream;
    var conn = newConnection(stream);
    startAndConnect(test, stream);

    var collName = Random.id();
    var coll = new Meteor.Collection(collName, {connection: conn});

    conn.methods({
      insertSomething: function () {
        // stub write
        coll.insert({foo: 'bar'});
      }
    });

    test.equal(coll.find().count(), 0);

    // Call a random method (no-op)
    conn.call('no-op', _.identity);
    // Call a wait method
    conn.apply('no-op', [], {wait: true}, _.identity);
    // Call a method with a stub that writes.
    conn.call('insertSomething', _.identity);


    // Stub write is visible.
    test.equal(coll.find({foo: 'bar'}).count(), 1);
    var stubWrittenId = coll.findOne({foo: 'bar'})._id;

    // first method sent
    var firstMethodId = testGotMessage(
      test, stream, {msg: 'method', method: 'no-op',
                     params: [], id: '*'});
    test.equal(stream.sent.length, 0);

    // ack the first method
    stream.receive({msg: 'updated', methods: [firstMethodId]});
    stream.receive({msg: 'result', id: firstMethodId});

    // Wait method sent.
    var waitMethodId = testGotMessage(
      test, stream, {msg: 'method', method: 'no-op',
                     params: [], id: '*'});
    test.equal(stream.sent.length, 0);

    // ack the wait method
    stream.receive({msg: 'updated', methods: [waitMethodId]});
    stream.receive({msg: 'result', id: waitMethodId});

    // insert method sent.
    var insertMethodId = testGotMessage(
      test, stream, {msg: 'method', method: 'insertSomething',
                     params: [], id: '*'});
    test.equal(stream.sent.length, 0);

    // ack the insert method
    stream.receive({msg: 'updated', methods: [insertMethodId]});
    stream.receive({msg: 'result', id: insertMethodId});

    // simulation reverted.
    test.equal(coll.find({foo: 'bar'}).count(), 0);

  });
}
Tinytest.add("livedata stub - reactive resub", function (test) {
  var stream = new StubStream();
  var conn = newConnection(stream);

  startAndConnect(test, stream);

  var readiedSubs = {};
  var markAllReady = function () {
    // synthesize a "ready" message in response to any "sub"
    // message with an id we haven't seen before
    _.each(stream.sent, function (msg) {
      msg = JSON.parse(msg);
      if (msg.msg === 'sub' && ! _.has(readiedSubs, msg.id)) {
        stream.receive({msg: 'ready', subs: [msg.id]});
        readiedSubs[msg.id] = true;
      }
    });
  };

  var fooArg = new ReactiveVar('A');
  var fooReady = 0;

  var inner;
  var outer = Deps.autorun(function () {
    inner = Deps.autorun(function () {
      conn.subscribe("foo-sub", fooArg.get(),
                     function () { fooReady++; });
    });
  });

  markAllReady();
  test.equal(fooReady, 1);

  // Rerun the inner autorun with different subscription
  // arguments.  Detect the re-sub via onReady.
  fooArg.set('B');
  test.isTrue(inner.invalidated);
  Deps.flush();
  test.isFalse(inner.invalidated);
  markAllReady();
  test.equal(fooReady, 2);

  // Rerun inner again with same args; should be no re-sub.
  inner.invalidate();
  test.isTrue(inner.invalidated);
  Deps.flush();
  test.isFalse(inner.invalidated);
  markAllReady();
  test.equal(fooReady, 2);

  // Rerun outer!  Should still be no re-sub even though
  // the inner computation is stopped and a new one is
  // started.
  outer.invalidate();
  test.isTrue(inner.invalidated);
  Deps.flush();
  test.isFalse(inner.invalidated);
  markAllReady();
  test.equal(fooReady, 2);

  // Change the subscription.  Now we should get an onReady.
  fooArg.set('C');
  Deps.flush();
  markAllReady();
  test.equal(fooReady, 3);
});



Tinytest.add("livedata connection - reactive userId", function (test) {
  var stream = new StubStream();
  var conn = newConnection(stream);

  test.equal(conn.userId(), null);
  conn.setUserId(1337);
  test.equal(conn.userId(), 1337);
});

Tinytest.add("livedata connection - two wait methods", function (test) {
  var stream = new StubStream();
  var conn = newConnection(stream);
  startAndConnect(test, stream);

  var collName = Random.id();
  var coll = new Meteor.Collection(collName, {connection: conn});

  // setup method
  conn.methods({do_something: function (x) {}});

  var responses = [];
  conn.apply('do_something', ['one!'], function() { responses.push('one'); });
  var one_message = JSON.parse(stream.sent.shift());
  test.equal(one_message.params, ['one!']);

  conn.apply('do_something', ['two!'], {wait: true}, function() {
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

  conn.apply('do_something', ['five!'], {wait: true}, function() {
    responses.push('five');
  });

  conn.apply('do_something', ['six!'], function() { responses.push('six'); });

  // Verify that we did not send any more methods since we are still waiting on
  // 'one!'.
  test.equal(stream.sent.length, 0);

  // Receive some data. "one" is not a wait method and there are no stubs, so it
  // gets applied immediately.
  test.equal(coll.find().count(), 0);
  stream.receive({msg: 'added', collection: collName,
                  id: 'foo', fields: {x: 1}});
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('foo'), {_id: 'foo', x: 1});

  // Let "one!" finish. Both messages are required to fire the callback.
  stream.receive({msg: 'result', id: one_message.id});
  test.equal(responses, []);
  stream.receive({msg: 'updated', methods: [one_message.id]});
  test.equal(responses, ['one']);

  // Now we've send out "two!".
  var two_message = JSON.parse(stream.sent.shift());
  test.equal(two_message.params, ['two!']);

  // But still haven't sent "three!".
  test.equal(stream.sent.length, 0);

  // Receive more data. "two" is a wait method, so the data doesn't get applied
  // yet.
  stream.receive({msg: 'changed', collection: collName,
                  id: 'foo', fields: {y: 3}});
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('foo'), {_id: 'foo', x: 1});

  // Let "two!" finish, with its end messages in the opposite order to "one!".
  stream.receive({msg: 'updated', methods: [two_message.id]});
  test.equal(responses, ['one']);
  test.equal(stream.sent.length, 0);
  // data-done message is enough to allow data to be written.
  test.equal(coll.find().count(), 1);
  test.equal(coll.findOne('foo'), {_id: 'foo', x: 1, y: 3});
  stream.receive({msg: 'result', id: two_message.id});
  test.equal(responses, ['one', 'two']);

  // Verify that we just sent "three!" and "four!" now that we got
  // responses for "one!" and "two!"
  test.equal(stream.sent.length, 2);
  var three_message = JSON.parse(stream.sent.shift());
  test.equal(three_message.params, ['three!']);
  var four_message = JSON.parse(stream.sent.shift());
  test.equal(four_message.params, ['four!']);

  // Out of order response is OK for non-wait methods.
  stream.receive({msg: 'result', id: three_message.id});
  stream.receive({msg: 'result', id: four_message.id});
  stream.receive({msg: 'updated', methods: [four_message.id]});
  test.equal(responses, ['one', 'two', 'four']);
  test.equal(stream.sent.length, 0);

  // Let three finish too.
  stream.receive({msg: 'updated', methods: [three_message.id]});
  test.equal(responses, ['one', 'two', 'four', 'three']);

  // Verify that we just sent "five!" (the next wait method).
  test.equal(stream.sent.length, 1);
  var five_message = JSON.parse(stream.sent.shift());
  test.equal(five_message.params, ['five!']);
  test.equal(responses, ['one', 'two', 'four', 'three']);

  // Let five finish.
  stream.receive({msg: 'result', id: five_message.id});
  stream.receive({msg: 'updated', methods: [five_message.id]});
  test.equal(responses, ['one', 'two', 'four', 'three', 'five']);

  var six_message = JSON.parse(stream.sent.shift());
  test.equal(six_message.params, ['six!']);
});

Tinytest.add("livedata connection - onReconnect prepends messages correctly with a wait method", function(test) {
  var stream = new StubStream();
  var conn = newConnection(stream);
  startAndConnect(test, stream);

  // setup method
  conn.methods({do_something: function (x) {}});

  conn.onReconnect = function() {
    conn.apply('do_something', ['reconnect zero'], _.identity);
    conn.apply('do_something', ['reconnect one'], _.identity);
    conn.apply('do_something', ['reconnect two'], {wait: true}, _.identity);
    conn.apply('do_something', ['reconnect three'], _.identity);
  };

  conn.apply('do_something', ['one'], _.identity);
  conn.apply('do_something', ['two'], {wait: true}, _.identity);
  conn.apply('do_something', ['three'], _.identity);

  // reconnect
  stream.sent = [];
  stream.reset();
  testGotMessage(test, stream, makeConnectMessage(conn._lastSessionId));

  // Test that we sent what we expect to send, and we're blocked on
  // what we expect to be blocked. The subsequent logic to correctly
  // read the wait flag is tested separately.
  test.equal(_.map(stream.sent, function(msg) {
    return JSON.parse(msg).params[0];
  }), ['reconnect zero', 'reconnect one']);

  // white-box test:
  test.equal(_.map(conn._outstandingMethodBlocks, function (block) {
    return [block.wait, _.map(block.methods, function (method) {
      return method._message.params[0];
    })];
  }), [
    [false, ['reconnect zero', 'reconnect one']],
    [true, ['reconnect two']],
    [false, ['reconnect three', 'one']],
    [true, ['two']],
    [false, ['three']]
  ]);
});

var getSelfConnectionUrl = function () {
  if (Meteor.isClient) {
    return Meteor._relativeToSiteRootUrl("/");
  } else {
    return Meteor.absoluteUrl();
  }
};

if (Meteor.isServer) {
  Meteor.methods({
    reverse: function (arg) {
      // Return something notably different from reverse.meteor.com.
      return arg.split("").reverse().join("") + " LOCAL";
    }
  });
}

testAsyncMulti("livedata connection - reconnect to a different server", [
  function (test, expect) {
    var self = this;
    self.conn = DDP.connect("reverse.meteor.com");
    pollUntil(expect, function () {
      return self.conn.status().connected;
    }, 5000, 100, true); // poll until connected, but don't fail if we don't connect
  },
  function (test, expect) {
    var self = this;
    self.doTest = self.conn.status().connected;
    if (self.doTest) {
      self.conn.call("reverse", "foo", expect(function (err, res) {
        test.equal(res, "oof");
      }));
    }
  },
  function (test, expect) {
    var self = this;
    if (self.doTest) {
      self.conn.reconnect({url: getSelfConnectionUrl()});
      self.conn.call("reverse", "bar", expect(function (err, res) {
        test.equal(res, "rab LOCAL");
      }));
    }
  }
]);

Tinytest.addAsync("livedata connection - version negotiation requires renegotiating",
                  function (test, onComplete) {
  var connection = new LivedataTest.Connection(getSelfConnectionUrl(), {
    reloadWithOutstanding: true,
    supportedDDPVersions: ["garbled", LivedataTest.SUPPORTED_DDP_VERSIONS[0]],
    onConnectionFailure: function () { test.fail(); onComplete(); },
    onConnected: function () {
      test.equal(connection._version, LivedataTest.SUPPORTED_DDP_VERSIONS[0]);
      connection._stream.disconnect({_permanent: true});
      onComplete();
    }
  });
});

Tinytest.addAsync("livedata connection - version negotiation error",
                  function (test, onComplete) {
  var connection = new LivedataTest.Connection(getSelfConnectionUrl(), {
    reloadWithOutstanding: true,
    supportedDDPVersions: ["garbled", "more garbled"],
    onConnectionFailure: function () {
      test.equal(connection.status().status, "failed");
      test.matches(connection.status().reason, /Version negotiation failed/);
      test.isFalse(connection.status().connected);
      onComplete();
    },
    onConnected: function () {
      test.fail();
      onComplete();
    }
  });
});

Tinytest.add("livedata connection - onReconnect prepends messages correctly without a wait method", function(test) {
  var stream = new StubStream();
  var conn = newConnection(stream);
  startAndConnect(test, stream);

  // setup method
  conn.methods({do_something: function (x) {}});

  conn.onReconnect = function() {
    conn.apply('do_something', ['reconnect one'], _.identity);
    conn.apply('do_something', ['reconnect two'], _.identity);
    conn.apply('do_something', ['reconnect three'], _.identity);
  };

  conn.apply('do_something', ['one'], _.identity);
  conn.apply('do_something', ['two'], {wait: true}, _.identity);
  conn.apply('do_something', ['three'], {wait: true}, _.identity);
  conn.apply('do_something', ['four'], _.identity);

  // reconnect
  stream.sent = [];
  stream.reset();
  testGotMessage(test, stream, makeConnectMessage(conn._lastSessionId));

  // Test that we sent what we expect to send, and we're blocked on
  // what we expect to be blocked. The subsequent logic to correctly
  // read the wait flag is tested separately.
  test.equal(_.map(stream.sent, function(msg) {
    return JSON.parse(msg).params[0];
  }), ['reconnect one', 'reconnect two', 'reconnect three', 'one']);

  // white-box test:
  test.equal(_.map(conn._outstandingMethodBlocks, function (block) {
    return [block.wait, _.map(block.methods, function (method) {
      return method._message.params[0];
    })];
  }), [
    [false, ['reconnect one', 'reconnect two', 'reconnect three', 'one']],
    [true, ['two']],
    [true, ['three']],
    [false, ['four']]
  ]);
});

Tinytest.add("livedata connection - onReconnect with sent messages", function(test) {
  var stream = new StubStream();
  var conn = newConnection(stream);
  startAndConnect(test, stream);

  // setup method
  conn.methods({do_something: function (x) {}});

  conn.onReconnect = function() {
    conn.apply('do_something', ['login'], {wait: true}, _.identity);
  };

  conn.apply('do_something', ['one'], _.identity);

  // initial connect
  stream.sent = [];
  stream.reset();
  testGotMessage(
    test, stream, makeConnectMessage(conn._lastSessionId));

  // Test that we sent just the login message.
  var loginId = testGotMessage(
    test, stream, {msg: 'method', method: 'do_something',
                   params: ['login'], id: '*'});

  // we connect.
  stream.receive({msg: 'connected', session: Random.id()});
  test.length(stream.sent, 0);

  // login got result (but not yet data)
  stream.receive({msg: 'result', id: loginId, result: 'foo'});
  test.length(stream.sent, 0);

  // login got data. now we send next method.
  stream.receive({msg: 'updated', methods: [loginId]});

  testGotMessage(
    test, stream, {msg: 'method', method: 'do_something',
                   params: ['one'], id: '*'});
});



Tinytest.add("livedata stub - reconnect double wait method", function (test) {
  var stream = new StubStream;
  var conn = newConnection(stream);
  startAndConnect(test, stream);

  var output = [];
  conn.onReconnect = function () {
    conn.apply('reconnectMethod', [], {wait: true}, function (err, result) {
      output.push('reconnect');
    });
  };

  conn.apply('halfwayMethod', [], {wait: true}, function (err, result) {
    output.push('halfway');
  });

  test.equal(output, []);
  // Method sent.
  var halfwayId = testGotMessage(
    test, stream, {msg: 'method', method: 'halfwayMethod',
                   params: [], id: '*'});
  test.equal(stream.sent.length, 0);

  // Get the result. This means it will not be resent.
  stream.receive({msg: 'result', id: halfwayId, result: 'bla'});
  // Callback not called.
  test.equal(output, []);

  // Reset stream. halfwayMethod does NOT get resent, but reconnectMethod does!
  // Reconnect quiescence happens when reconnectMethod is done.
  stream.reset();
  testGotMessage(test, stream, makeConnectMessage(SESSION_ID));
  var reconnectId = testGotMessage(
    test, stream, {msg: 'method', method: 'reconnectMethod',
                   params: [], id: '*'});
  test.length(stream.sent, 0);
  // Still holding out hope for session resumption, so no callbacks yet.
  test.equal(output, []);

  // Receive 'connected', but reconnect quiescence is blocking on
  // reconnectMethod.
  stream.receive({msg: 'connected', session: SESSION_ID + 1});
  test.equal(output, []);

  // Data-done for reconnectMethod. This gets us to reconnect quiescence, so
  // halfwayMethod's callback fires. reconnectMethod's is still waiting on its
  // result.
  stream.receive({msg: 'updated', methods: [reconnectId]});
  test.equal(output.shift(), 'halfway');
  test.equal(output, []);

  // Get result of reconnectMethod. Its callback fires.
  stream.receive({msg: 'result', id: reconnectId, result: 'foo'});
  test.equal(output.shift(), 'reconnect');
  test.equal(output, []);

  // Call another method. It should be delivered immediately. This is a
  // regression test for a case where it never got delivered because there was
  // an empty block in _outstandingMethodBlocks blocking it from being sent.
  conn.call('lastMethod', _.identity);
  testGotMessage(test, stream,
                 {msg: 'method', method: 'lastMethod', params: [], id: '*'});
});

Tinytest.add("livedata stub - subscribe errors", function (test) {
  var stream = new StubStream();
  var conn = newConnection(stream);

  startAndConnect(test, stream);

  // subscribe
  var onReadyFired = false;
  var subError = null;
  var sub = conn.subscribe('unknownSub', {
    onReady: function () {
      onReadyFired = true;
    },
    onError: function (error) {
      subError = error;
    }
  });
  test.isFalse(onReadyFired);
  test.equal(subError, null);

  var subMessage = JSON.parse(stream.sent.shift());
  test.equal(subMessage, {msg: 'sub', name: 'unknownSub', params: [],
                          id: subMessage.id});

  // Reject the sub.
  stream.receive({msg: 'nosub', id: subMessage.id,
                  error: new Meteor.Error(404, "Subscription not found")});
  test.isFalse(onReadyFired);
  test.instanceOf(subError, Meteor.Error);
  test.equal(subError.error, 404);
  test.equal(subError.reason, "Subscription not found");

  // stream reset: reconnect!
  stream.reset();
  // We send a connect.
  testGotMessage(test, stream, makeConnectMessage(SESSION_ID));
  // We should NOT re-sub to the sub, because we processed the error.
  test.length(stream.sent, 0);
  test.isFalse(onReadyFired);
});

if (Meteor.isClient) {
  Tinytest.add("livedata stub - stubs before connected", function (test) {
    var stream = new StubStream();
    var conn = newConnection(stream);

    var collName = Random.id();
    var coll = new Meteor.Collection(collName, {connection: conn});

    // Start and send "connect", but DON'T get 'connected' quite yet.
    stream.reset(); // initial connection start.

    testGotMessage(test, stream, makeConnectMessage());
    test.length(stream.sent, 0);

    // Insert a document. The stub updates "conn" directly.
    coll.insert({_id: "foo", bar: 42}, _.identity);
    test.equal(coll.find().count(), 1);
    test.equal(coll.findOne(), {_id: "foo", bar: 42});
    // It also sends the method message.
    var methodMessage = JSON.parse(stream.sent.shift());
    test.equal(methodMessage, {msg: 'method', method: '/' + collName + '/insert',
                               params: [{_id: "foo", bar: 42}],
                               id: methodMessage.id});
    test.length(stream.sent, 0);

    // Now receive a connected message. This should not clear the
    // _documentsWrittenByStub state!
    stream.receive({msg: 'connected', session: SESSION_ID});
    test.length(stream.sent, 0);
    test.equal(coll.find().count(), 1);

    // Now receive the "updated" message for the method. This should revert the
    // insert.
    stream.receive({msg: 'updated', methods: [methodMessage.id]});
    test.length(stream.sent, 0);
    test.equal(coll.find().count(), 0);
  });
}
// XXX also test:
// - reconnect, with session resume.
// - restart on update flag
// - on_update event
// - reloading when the app changes, including session migration
