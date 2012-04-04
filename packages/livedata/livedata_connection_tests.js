var test_got_message = function (test, stream, expected) {
  if (stream.sent.length === 0) {
    test.fail({error: 'no message received', expected: expected});
    return;
  }

  var got = stream.sent.shift();

  if (typeof got === 'string' && typeof expected === 'object')
    got = JSON.parse(got);

  test.equal(got, expected);
};

var SESSION_ID = '17';

Tinytest.add("livedata stub - receive data", function (test) {
  var stream = new Meteor._StubStream();
  var conn = new Meteor._LivedataConnection(stream);

  stream.reset(); // initial connection start.

  test_got_message(test, stream, {msg: 'connect'});
  test.length(stream.sent, 0);

  stream.receive({msg: 'connected', session: SESSION_ID});
  test.length(stream.sent, 0);

  // data comes in for unknown collection.
  var coll_name = Meteor.uuid();
  stream.receive({msg: 'data', collection: coll_name, id: '1234',
                  set: {a: 1}});
  // break throught the black box and test internal state
  test.length(conn.queued[coll_name], 1);

  var coll = new Meteor.Collection(coll_name, conn);

  // queue has been emptied and doc is in db.
  test.isUndefined(conn.queued[coll_name]);
  test.equal(coll.find({}).fetch(), [{_id:'1234', a:1}]);

  // second message. applied directly to the db.
  stream.receive({msg: 'data', collection: coll_name, id: '1234',
                  set: {a:2}});
  test.equal(coll.find({}).fetch(), [{_id:'1234', a:2}]);
  test.isUndefined(conn.queued[coll_name]);
});



Tinytest.add("livedata stub - subscribe", function (test) {
  var stream = new Meteor._StubStream();
  var conn = new Meteor._LivedataConnection(stream);

  stream.reset(); // initial connection start.

  test_got_message(test, stream, {msg: 'connect'});
  test.length(stream.sent, 0);

  stream.receive({msg: 'connected', session: SESSION_ID});
  test.length(stream.sent, 0);

  // subscribe
  var callback_fired = false;
  var sub = conn.subscribe('my_data', function () {
    callback_fired = true;
  });
  test.isFalse(callback_fired);

  var message = JSON.parse(stream.sent.shift());
  var id = message.id;
  delete message.id;
  test.equal(message, {msg: 'sub', name: 'my_data', params: []});

  // get the sub satisfied. callback fires.
  stream.receive({msg: 'data', 'subs': [id]});
  test.isTrue(callback_fired);
});


Tinytest.add("livedata stub - this", function (test) {
  var stream = new Meteor._StubStream();
  var conn = new Meteor._LivedataConnection(stream);

  stream.reset(); // initial connection start.
  test_got_message(test, stream, {msg: 'connect'});

  stream.receive({msg: 'connected', session: SESSION_ID});
  test.length(stream.sent, 0);

  conn.methods({test_this: function() {
    test.isTrue(this.is_simulation);
    this.unblock(); // should be a no-op
  }});

  // should throw no exceptions
  conn.call('test_this');

  // satisfy method, quiesce connection
  var message = JSON.parse(stream.sent.shift());
  test.equal(message, {msg: 'method', method: 'test_this',
                       params: [], id:message.id});
  test.length(stream.sent, 0);

  stream.receive({msg: 'result', id:message.id, result:null});
  stream.receive({msg: 'data', 'methods': [message.id]});

});


Tinytest.add("livedata stub - methods", function (test) {
  var stream = new Meteor._StubStream();
  var conn = new Meteor._LivedataConnection(stream);

  stream.reset(); // initial connection start.

  test_got_message(test, stream, {msg: 'connect'});
  test.length(stream.sent, 0);

  stream.receive({msg: 'connected', session: SESSION_ID});
  test.length(stream.sent, 0);

  var coll_name = Meteor.uuid();
  var coll = new Meteor.Collection(coll_name, conn);

  // setup method
  conn.methods({do_something: function (x) {
    coll.insert({value: x});
  }});

  // setup observers
  var counts = {added: 0, removed: 0, changed: 0, moved: 0};
  var handle = coll.find({}).observe(
    { added: function () { counts.added += 1; },
      removed: function () { counts.removed += 1; },
      changed: function () { counts.changed += 1; },
      moved: function () { counts.moved += 1; }
    });


  // call method with results callback
  var callback_fired = false;
  conn.call('do_something', 'friday!', function (err, res) {
    test.isUndefined(err);
    test.equal(res, '1234');
    callback_fired = true;
  });
  test.isFalse(callback_fired);

  // observers saw the method run.
  test.equal(counts, {added: 1, removed: 0, changed: 0, moved: 0});

  // get response from server
  var message = JSON.parse(stream.sent.shift());
  test.equal(message, {msg: 'method', method: 'do_something',
                       params: ['friday!'], id:message.id});

  test.equal(coll.find({}).count(), 1);
  test.equal(coll.find({value: 'friday!'}).count(), 1);

  // results result in callback
  stream.receive({msg: 'result', id:message.id, result:"1234"});
  test.isTrue(callback_fired);

  // data methods do not show up (not quiescent yet)
  stream.receive({msg: 'data', collection: coll_name, id: '1234',
                  set: {value: 'tuesday'}});

  test.equal(coll.find({}).count(), 1);
  test.equal(coll.find({value: 'friday!'}).count(), 1);
  test.equal(counts, {added: 1, removed: 0, changed: 0, moved: 0});

  // send another methods (unknown on client)
  callback_fired = false;
  conn.call('do_something_else', 'monday', function (err, res) {
    callback_fired = true;
  });
  test.isFalse(callback_fired);

  // test we still send a method request to server
  var message_2 = JSON.parse(stream.sent.shift());
  test.equal(message_2, {msg: 'method', method: 'do_something_else',
                         params: ['monday'], id:message_2.id});

  // get the first data satisfied message. changes are still not applied
  // to database.
  stream.receive({msg: 'data', 'methods': [message.id]});

  test.equal(coll.find({}).count(), 1);
  test.equal(coll.find({value: 'friday!'}).count(), 1);
  test.equal(counts, {added: 1, removed: 0, changed: 0, moved: 0});

  // second result
  stream.receive({msg: 'result', id:message_2.id, result:"bupkis"});
  test.isTrue(callback_fired);

  // get second satisfied, now changes are applied.
  stream.receive({msg: 'data', 'methods': [message_2.id]});

  test.equal(coll.find({}).count(), 1);
  test.equal(coll.find({value: 'friday!'}).count(), 0);
  test.equal(coll.find({value: 'tuesday', _id: '1234'}).count(), 1);
  test.equal(counts, {added: 2, removed: 1, changed: 0, moved: 0});

  handle.stop();
});


// method calls another method in simulation. see not sent.
Tinytest.add("livedata stub - sub methods", function (test) {
  var stream = new Meteor._StubStream();
  var conn = new Meteor._LivedataConnection(stream);

  stream.reset(); // initial connection start.

  test_got_message(test, stream, {msg: 'connect'});
  test.length(stream.sent, 0);

  stream.receive({msg: 'connected', session: SESSION_ID});
  test.length(stream.sent, 0);

  var coll_name = Meteor.uuid();
  var coll = new Meteor.Collection(coll_name, conn);

  // setup methods
  conn.methods({
    do_something: function () {
      conn.call('do_something_else');
    },
    do_something_else: function () {
      coll.insert({a: 1});
    }
  });

  // setup observers
  var counts = {added: 0, removed: 0, changed: 0, moved: 0};
  var handle = coll.find({}).observe(
    { added: function () { counts.added += 1; },
      removed: function () { counts.removed += 1; },
      changed: function () { counts.changed += 1; },
      moved: function () { counts.moved += 1; }
    });


  // call method.
  conn.call('do_something');

  // see we only send message for outer methods
  var message = JSON.parse(stream.sent.shift());
  test.equal(message, {msg: 'method', method: 'do_something',
                       params: [], id:message.id});
  test.length(stream.sent, 0);

  // but inner method runs locally.
  test.equal(counts, {added: 1, removed: 0, changed: 0, moved: 0});

  // we get the results (this is important to make the test not block
  // auto-reload!)
  stream.receive({msg: 'result', id:message.id, result:"1234"});

  // get data from the method. does not show up.
  stream.receive({msg: 'data', collection: coll_name, id: '1234',
                  set: {value: 'tuesday'}});
  test.equal(counts, {added: 1, removed: 0, changed: 0, moved: 0});

  // get method satisfied. data shows up.
  stream.receive({msg: 'data', 'methods': [message.id]});
  test.equal(counts, {added: 2, removed: 1, changed: 0, moved: 0});

  handle.stop();
});


// initial connect
// make a sub
// do a method
// satisfy sub
// reconnect
// method gets resent
// get data from server
// data NOT shown
// satisfy method
// data NOT shown
// resatisfy sub
// data is shown
Tinytest.add("livedata stub - reconnect", function (test) {
  var stream = new Meteor._StubStream();
  var conn = new Meteor._LivedataConnection(stream);

  stream.reset(); // initial connection start.

  test_got_message(test, stream, {msg: 'connect'});
  test.length(stream.sent, 0);

  stream.receive({msg: 'connected', session: SESSION_ID});
  test.length(stream.sent, 0);

  var coll_name = Meteor.uuid();
  var coll = new Meteor.Collection(coll_name, conn);

  // setup observers
  var counts = {added: 0, removed: 0, changed: 0, moved: 0};
  var handle = coll.find({}).observe(
    { added: function () { counts.added += 1; },
      removed: function () { counts.removed += 1; },
      changed: function () { counts.changed += 1; },
      moved: function () { counts.moved += 1; }
    });

  // subscribe
  var sub_callback_fired = false;
  var sub = conn.subscribe('my_data', function () {
    sub_callback_fired = true;
  });
  test.isFalse(sub_callback_fired);

  var sub_message = JSON.parse(stream.sent.shift());
  test.equal(sub_message, {msg: 'sub', name: 'my_data', params: [],
                           id: sub_message.id});


  // get some data. it shows up.
  stream.receive({msg: 'data', collection: coll_name,
                  id: '1234', set: {a:1}});

  test.equal(coll.find({}).count(), 1);
  test.equal(counts, {added: 1, removed: 0, changed: 0, moved: 0});
  test.isFalse(sub_callback_fired);

  stream.receive({msg: 'data', collection: coll_name,
                  id: '1234', set: {b:2},
                  subs: [sub_message.id] // satisfy sub
                 });
  test.isTrue(sub_callback_fired);
  sub_callback_fired = false; // re-arm for test that it doesn't fire again.

  test.equal(coll.find({a:1, b:2}).count(), 1);
  test.equal(counts, {added: 1, removed: 0, changed: 1, moved: 0});

  // call method.
  var method_callback_fired = false;
  conn.call('do_something', function () {
    method_callback_fired = true;
  });
  test.isFalse(method_callback_fired);

  var method_message = JSON.parse(stream.sent.shift());
  test.equal(method_message, {msg: 'method', method: 'do_something',
                              params: [], id:method_message.id});

  // more data. doesn't show up.
  stream.receive({msg: 'data', collection: coll_name,
                  id: '1234', set: {c:3}});
  test.equal(coll.find({c:3}).count(), 0);
  test.equal(counts, {added: 1, removed: 0, changed: 1, moved: 0});


  // stream reset. reconnect!
  // we send a connect, our pending messages, and our subs.
  stream.reset();

  test_got_message(test, stream, {msg: 'connect', session: SESSION_ID});
  test_got_message(test, stream, method_message);
  test_got_message(test, stream, sub_message);

  // reconnect with different session id
  stream.receive({msg: 'connected', session: SESSION_ID + 1});

  // resend data. doesn't show up.
  stream.receive({msg: 'data', collection: coll_name,
                  id: '1234', set: {a:1, b:2, c:3}});
  stream.receive({msg: 'data', collection: coll_name,
                  id: '2345', set: {d:4}});

  test.equal(coll.find({c:3}).count(), 0);
  test.equal(counts, {added: 1, removed: 0, changed: 1, moved: 0});

  // satisfy and return method callback
  stream.receive({msg: 'data', methods: [method_message.id]});

  test.isFalse(method_callback_fired);
  stream.receive({msg: 'result', id:method_message.id, result:"bupkis"});
  test.isTrue(method_callback_fired);

  // still no update.
  test.equal(coll.find({c:3}).count(), 0);
  test.equal(counts, {added: 1, removed: 0, changed: 1, moved: 0});

  // re-satisfy sub
  stream.receive({msg: 'data', subs: [sub_message.id]});

  // now the doc changes
  test.equal(coll.find({c:3}).count(), 1);
  test.equal(counts, {added: 2, removed: 0, changed: 2, moved: 0});


  handle.stop();
});

// XXX also test:
// - reconnect, with session resume.
// - restart on update flag
// - on_update event
