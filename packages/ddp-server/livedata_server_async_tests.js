
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// connectionId -> callback
var onSubscription = {};

Meteor.publish('livedata_server_test_sub_async', async function(connectionId) {
  await Meteor._sleepForMs(50);
  var callback = onSubscription[connectionId];
  if (callback) callback(this);
  this.stop();
});

Meteor.publish('livedata_server_test_sub_context_async', async function(
  connectionId,
  userId
) {
  await Meteor._sleepForMs(50);
  var callback = onSubscription[connectionId];
  var methodInvocation = DDP._CurrentMethodInvocation.get();
  var publicationInvocation = DDP._CurrentPublicationInvocation.get();

// console.log('methodInvocation', methodInvocation);
// console.log('publicationInvocation', !!publicationInvocation);
  // Check the publish function's environment variables and context.
  if (callback) {
    callback.call(this, methodInvocation, publicationInvocation);
  }

  // Check that onStop callback is have the same context as the publish function
  // and that it runs with the same environment variables as this publish function.
  this.onStop(function() {
    var onStopMethodInvocation = DDP._CurrentMethodInvocation.get();
    var onStopPublicationInvocation = DDP._CurrentPublicationInvocation.get();

    callback.call(
      this,
      onStopMethodInvocation,
      onStopPublicationInvocation,
      true
    );
  });

  if (this.userId) {
    this.stop();
  } else {
    this.ready();
    await Meteor.callAsync('livedata_server_test_setuserid', userId);
  }
});

Tinytest.addAsync(
  'livedata server - connection in async publish function',
  function(test, onComplete) {
    makeTestConnection(test, function(clientConn, serverConn) {
      onSubscription[serverConn.id] = function(subscription) {
        delete onSubscription[serverConn.id];
        test.equal(subscription.connection.id, serverConn.id);
        clientConn.disconnect();
        onComplete();
      };
      clientConn.subscribe('livedata_server_test_sub_async', serverConn.id);
    });
  }
);

Tinytest.addAsync(
  'livedata server - verify context in async publish function',
  function(test, onComplete) {
    makeTestConnection(test, function(clientConn, serverConn) {
      var userId = 'someUserId';
      onSubscription[serverConn.id] = function(
        methodInvocation,
        publicationInvocation,
        fromOnStop
      ) {
        // DDP._CurrentMethodInvocation should be undefined in a publish function
        test.isUndefined(methodInvocation, 'Should have been undefined');
        // DDP._CurrentPublicationInvocation should be set in a publish function
        test.isNotUndefined(publicationInvocation, 'Should have been defined');
        if (this.userId === userId && fromOnStop) {
          delete onSubscription[serverConn.id];
          clientConn.disconnect();
          onComplete();
        }
      };
      clientConn.subscribe(
        'livedata_server_test_sub_context_async',
        serverConn.id,
        userId
      );
    });
  }
);

let onSubscriptions = {};

Meteor.publish({
  async publicationObjectAsync() {
    await Meteor._sleepForMs(50);
    let callback = onSubscriptions;
    if (callback) callback("publicationObjectAsync");
    this.stop();
  },
});

Meteor.publish({
  publication_object_async: async function() {
    await Meteor._sleepForMs(50);
    let callback = onSubscriptions;
    if (callback) callback("publication_object_async");
    this.stop();
  },
});

Meteor.publish('publication_compatibility_async', async function() {
  await Meteor._sleepForMs(50);
  let callback = onSubscriptions;
  if (callback) callback("publication_compatibility_async");
  this.stop();
});

Tinytest.addAsync('livedata server - async publish object', function(
  test,
  onComplete
) {
  makeTestConnection(test, function(clientConn, serverConn) {
    let testsLength = 0;

    onSubscriptions = function(subscription) {
      // for debugging
      // console.log('subscription is ok:', subscription) 
      testsLength++;
      if (testsLength === 3) {
        clientConn.disconnect();
        onComplete();
      }
    };
    clientConn.subscribe('publicationObjectAsync');
    clientConn.subscribe('publication_object_async');
    clientConn.subscribe('publication_compatibility_async');
  });
});
const collection = new Mongo.Collection('names');

async function getAllNames(shouldThrow = false) {
  const count = await collection.rawCollection().count();
  if (shouldThrow) {
    throw new Meteor.Error('Expected error');
  }
  if (count <= 0) {
    await collection.insertAsync({ name: 'async' });
  }
}
Meteor.publish('asyncPublishCursor', async function() {
  await getAllNames();
  return collection.find();
});

Tinytest.addAsync('livedata server - async publish cursor', function(
  test,
  onComplete
) {
  makeTestConnection(test, (clientConn, serverConn) => {
    const remoteCollection = new Mongo.Collection('names', {
      connection: clientConn,
    });
    clientConn.subscribe('asyncPublishCursor', async () => {
      const actual = await remoteCollection.find().fetch();
      test.equal(actual[0].name, 'async');
      onComplete();
    });
  });
});

Meteor.publish('asyncPublishErrorCursor', async function() {
  await getAllNames(true);
  return collection.find();
});

Tinytest.addAsync('livedata server - async publish test error thrown', function(
  test,
  onComplete
) {
  makeTestConnection(test, (clientConn, serverConn) => {
    clientConn.subscribe('asyncPublishErrorCursor', {
      onStop: e => {
        test.equal(e.error, 'Expected error');
        onComplete();
      },
    });
  });
});
