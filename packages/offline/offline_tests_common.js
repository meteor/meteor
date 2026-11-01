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
    if (Meteor.isServer) {
      executions.set(_id, (executions.get(_id) || 0) + 1);
      order.push(_id);
    }
    await Items.upsertAsync({ _id }, { $setOnInsert: { _id, value } });
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
});

if (Meteor.isServer) {
  Meteor.publish('offline_test.items', () => Items.find());
}
