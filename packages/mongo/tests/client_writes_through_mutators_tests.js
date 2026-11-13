import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Tinytest } from 'meteor/tinytest';

// Writes sent by clients, once accepted by allow/deny rules or in insecure
// mode, go through the collection's own mutators on the server, so an
// overridden mutator sees them. The overrides below record their calls and
// the server reports them back to the client.
const calls = [];

class RecordingCollection extends Mongo.Collection {
  insertAsync(doc, ...rest) {
    calls.push({ method: 'insertAsync', collection: this._name, args: [doc] });
    return super.insertAsync(doc, ...rest);
  }

  updateAsync(selector, modifier, ...rest) {
    calls.push({
      method: 'updateAsync',
      collection: this._name,
      args: [selector, modifier],
    });
    return super.updateAsync(selector, modifier, ...rest);
  }

  removeAsync(selector, ...rest) {
    calls.push({ method: 'removeAsync', collection: this._name, args: [selector] });
    return super.removeAsync(selector, ...rest);
  }
}

const allowCollection = new RecordingCollection(
  'test_client_writes_through_mutators_allow'
);
const insecureCollection = new RecordingCollection(
  'test_client_writes_through_mutators_insecure'
);

const selectorId = selector =>
  typeof selector === 'string' ? selector : selector && selector._id;

if (Meteor.isServer) {
  allowCollection.allow({
    insert: () => true,
    update: () => true,
    remove: () => true,
  });
  insecureCollection._insecure = true;

  Meteor.methods({
    // Returns the mutator calls recorded on the server since the last call.
    test_client_writes_through_mutators_calls() {
      return calls.splice(0, calls.length);
    },
  });

  Tinytest.addAsync(
    'allow-deny - server writes run the overridden mutators',
    async function (test) {
      const collection = new RecordingCollection(null);
      calls.length = 0;

      const id = await collection.insertAsync({ value: 1 });
      await collection.updateAsync(id, { $set: { value: 2 } });
      await collection.removeAsync(id);

      test.equal(
        calls.map(call => call.method),
        ['insertAsync', 'updateAsync', 'removeAsync']
      );
    }
  );
}

if (Meteor.isClient) {
  const serverCalls = async collection => {
    const recorded = await Meteor.callAsync(
      'test_client_writes_through_mutators_calls'
    );
    return recorded.filter(call => call.collection === collection._name);
  };

  const assertWriteSequence = (test, recorded, id) => {
    test.equal(
      recorded.map(call => call.method),
      ['insertAsync', 'updateAsync', 'removeAsync']
    );
    test.equal(recorded[0].args[0]._id, id, 'insert received the client id');
    test.equal(recorded[0].args[0].value, 1);
    test.equal(selectorId(recorded[1].args[0]), id);
    test.equal(recorded[1].args[1], { $set: { value: 2 } });
    test.equal(selectorId(recorded[2].args[0]), id);
  };

  Tinytest.addAsync(
    'allow-deny - client async writes accepted by allow rules run the server mutators',
    async function (test) {
      await serverCalls(allowCollection);

      const id = await allowCollection.insertAsync({ value: 1 });
      test.equal(typeof id, 'string');
      // Without a subscription the client resolves these with the stub's
      // result, so only the server-side calls are asserted.
      await allowCollection.updateAsync(id, { $set: { value: 2 } });
      await allowCollection.removeAsync(id);

      assertWriteSequence(test, await serverCalls(allowCollection), id);
    }
  );

  Tinytest.addAsync(
    'allow-deny - client async writes in insecure mode run the server mutators',
    async function (test) {
      await serverCalls(insecureCollection);

      const id = await insecureCollection.insertAsync({ value: 1 });
      test.equal(typeof id, 'string');
      // Without a subscription the client resolves these with the stub's
      // result, so only the server-side calls are asserted.
      await insecureCollection.updateAsync(id, { $set: { value: 2 } });
      await insecureCollection.removeAsync(id);

      assertWriteSequence(test, await serverCalls(insecureCollection), id);
    }
  );

  // The sync client API reaches the server through the /name/insert,
  // /name/update and /name/remove methods, which only exist in insecure mode.
  const callWithCallback = (collection, method, ...args) =>
    new Promise((resolve, reject) => {
      collection[method](...args, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });

  Tinytest.addAsync(
    'allow-deny - client sync writes in insecure mode run the server mutators',
    async function (test) {
      await serverCalls(insecureCollection);

      const id = await callWithCallback(insecureCollection, 'insert', { value: 1 });
      test.equal(typeof id, 'string');
      test.equal(
        await callWithCallback(insecureCollection, 'update', id, {
          $set: { value: 2 },
        }),
        1
      );
      test.equal(await callWithCallback(insecureCollection, 'remove', id), 1);

      assertWriteSequence(test, await serverCalls(insecureCollection), id);
    }
  );
}
