const prefix = 'mongo-fieldless-replication';

if (Meteor.isServer) {
  const { DDPServer } = require('meteor/ddp-server');
  const collections = new Map();

  // Server-only methods: no optimistic writes participate in this regression.
  Meteor.methods({
    async [`${prefix}/seed`](name) {
      check(name, String);
      const collection = new Mongo.Collection(name, {
        defineMutationMethods: false, _preventAutopublish: true,
      });
      collections.set(name, collection);
      Meteor.server.setPublicationStrategy(name, DDPServer.publicationStrategies.NO_MERGE_NO_HISTORY);
      await collection.insertAsync({
        _id: 'record', label: 'retained', temporary: 'remove-later',
      });
    },
    async [`${prefix}/update`](name) {
      check(name, String);
      await collections.get(name).updateAsync('record', { $set: { label: 'updated' } });
    },
    async [`${prefix}/cleanup`](name) {
      check(name, String);
      const collection = collections.get(name);
      if (!collection) return;
      try {
        await collection.dropCollectionAsync();
      } finally {
        collections.delete(name);
        delete Meteor.server._publicationStrategies[name];
        if (Mongo._collections.get(name) === collection) Mongo._collections.delete(name);
      }
    },
  });

  Meteor.publish(`${prefix}/full`, function (name) {
    check(name, String);
    return collections.get(name).find('record');
  });
  Meteor.publish(`${prefix}/ids`, function (name) {
    check(name, String);
    return collections.get(name).find('record', { projection: { _id: 1 } });
  });
}

if (Meteor.isClient) {
  Tinytest.addAsync('mongo fieldless replication - stock publication replay', async test => {
    const name = `${prefix}-${Random.id()}`;
    // A broken update must not wedge the connection used to report Tinytests.
    const connection = DDP.connect(Meteor.absoluteUrl(), { retry: false });
    const collection = new Mongo.Collection(name, { connection, defineMutationMethods: false });
    const messages = [];
    const errors = [];
    const subscriptions = [];
    let onMessageReceived;
    const onMessage = raw => {
      messages.push(JSON.parse(raw));
      onMessageReceived?.();
    };
    const onError = event => errors.push(event.error?.stack || event.message);
    const onRejection = event => errors.push(event.reason?.stack || String(event.reason));
    const originalDebug = Meteor._debug;
    Meteor._debug = function (...args) {
      errors.push(args.map(value => value?.stack || String(value)).join(' '));
      return originalDebug.apply(this, args);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    // Observe the actual wire input, without wrapping the store or injecting DDP.
    connection._stream.on('message', onMessage);

    const stage = async (label, promise) => {
      let timer;
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 15000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    const waitForMessage = async (label, predicate) => {
      try {
        return await stage(label, new Promise(resolve => {
          onMessageReceived = () => {
            const message = messages.find(predicate);
            if (message) resolve(message);
          };
          onMessageReceived();
        }));
      } finally {
        onMessageReceived = null;
      }
    };
    const subscribe = kind => stage(`${kind} subscription ready`, new Promise((resolve, reject) => {
      const handle = connection.subscribe(`${prefix}/${kind}`, name, {
        onReady: () => resolve(handle),
        onStop: error => { if (error) reject(error); },
      });
      subscriptions.push(handle);
    }));
    const stop = async handle => {
      handle.stop();
      await waitForMessage('subscription stopped', msg =>
        msg.msg === 'nosub' && msg.id === handle.subscriptionId);
    };

    try {
      await collection._settingUpReplicationPromise;
      await stage('seed method', connection.callAsync(`${prefix}/seed`, name));
      const initial = { _id: 'record', label: 'retained', temporary: 'remove-later' };
      const full = await subscribe('full');
      test.equal(collection.findOne('record'), initial);
      await stop(full);
      test.equal(collection.findOne('record'), initial);

      const [replay, ids] = await Promise.all([
        waitForMessage('fieldless addition', msg =>
          msg.msg === 'added' && msg.collection === name && msg.id === 'record' &&
          !Object.prototype.hasOwnProperty.call(msg, 'fields')),
        subscribe('ids'),
      ]);
      test.equal(replay, { msg: 'added', collection: name, id: 'record' });
      test.equal(collection.findOne('record'), initial);
      test.equal(errors, []);

      await stage('update method', connection.callAsync(`${prefix}/update`, name));
      await stop(ids);
      await subscribe('full');
      test.equal(collection.findOne('record'), { ...initial, label: 'updated' });
      test.equal(errors, []);
    } catch (error) {
      console.error('Fieldless replication diagnostics:', JSON.stringify({ messages, errors }));
      throw error;
    } finally {
      const cleanupErrors = [];
      for (const handle of subscriptions) {
        try { await stop(handle); } catch (error) { cleanupErrors.push(error.message); }
      }
      connection.close();
      const callbacks = connection._stream.eventCallbacks.message;
      callbacks.splice(callbacks.indexOf(onMessage), 1);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      Meteor._debug = originalDebug;
      collection._collection.remove({});
      delete connection._mongo_livedata_collections[name];
      if (Mongo._collections.get(name) === collection) Mongo._collections.delete(name);
      try {
        // The control connection still works when the tested connection has failed.
        await stage('server cleanup', Meteor.callAsync(`${prefix}/cleanup`, name));
      } catch (error) {
        cleanupErrors.push(error.message);
      }
      test.equal(cleanupErrors, [], 'owned publication resources were cleaned up');
    }
  });
}
