import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

// Shared by the client tests and the test server: an isomorphic, idempotent
// Method (client-generated id, insert-if-absent) and a Method the server
// rejects. The server counts executions so the tests can check "once".
export const Items = new Mongo.Collection('offline_test_items');
const executions = new Map();
const order = [];

Meteor.methods({
  async 'offline_test.insert'({ _id, value }) {
    if (typeof _id !== 'string') throw new Meteor.Error('offline-test-bad-id', 'the id must be a string');
    if (Meteor.isServer) {
      executions.set(_id, (executions.get(_id) || 0) + 1);
      order.push(_id);
    }
    await Items.upsertAsync({ _id }, { $setOnInsert: { _id, value } });
  },
  async 'offline_test.setValue'({ _id, value }) {
    await Items.updateAsync({ _id }, { $set: { value } });
  },
  // Its stub calls a listed Method: that inner call is part of the simulation.
  async 'offline_test.nested'({ _id, value }) {
    await Meteor.callAsync('offline_test.insert', { _id, value });
  },
  'offline_test.order'(ids) {
    return order.filter((_id) => ids.includes(_id));
  },
  'offline_test.fail'() {
    if (Meteor.isServer) throw new Meteor.Error('offline-test', 'rejected on purpose');
  },
  'offline_test.executions'(_id) {
    return executions.get(_id) || 0;
  },
  // A sync stub, for Meteor.apply.
  'offline_test.ping'(_id) {
    if (Meteor.isServer) executions.set(_id, (executions.get(_id) || 0) + 1);
  },
});

if (Meteor.isServer) {
  Meteor.publish('offline_test.items', () => Items.find());
}
