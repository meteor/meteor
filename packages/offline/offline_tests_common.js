import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { EJSON } from 'meteor/ejson';

// Shared by the client tests and the test server: an isomorphic, idempotent
// Method (client-generated id, insert-if-absent) and a Method the server
// rejects. The server counts executions so the tests can check "once".
export const Items = new Mongo.Collection('offline_test_items');
const executions = new Map();

// A custom EJSON type registered by the app, as mongo-decimal's Decimal is: the
// copy and the recorded calls must give it back as an instance.
export class Amount {
  constructor(cents) {
    this.cents = cents;
  }
  typeName() {
    return 'offline_test.Amount';
  }
  toJSONValue() {
    return { cents: this.cents };
  }
}
EJSON.addType('offline_test.Amount', ({ cents }) => new Amount(cents));
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
  Meteor.publish('offline_test.unlisted', () => Items.find());
  // Neither a cursor nor this.ready(): the server never answers it.
  Meteor.publish('offline_test.never_ready', function () {});
  // Ready when a test says so, in whatever session it runs. On a reconnection
  // the client sends its Methods before its subscriptions, so a request can
  // come before the run it is meant for: that run is then ready at once.
  const waiting = new Map(); // key -> ready functions
  const early = new Map(); // key -> requests made while nothing was waiting
  Meteor.publish('offline_test.ready_on_demand', function (key) {
    if (early.get(key) > 0) {
      early.set(key, early.get(key) - 1);
      this.ready();
      return;
    }
    const ready = () => this.ready();
    if (!waiting.has(key)) waiting.set(key, new Set());
    waiting.get(key).add(ready);
    this.onStop(() => waiting.get(key)?.delete(ready));
  });
  Meteor.publish('offline_test.ready_after', function (delay) {
    const timer = Meteor.setTimeout(() => this.ready(), delay);
    this.onStop(() => Meteor.clearTimeout(timer));
  });
  Meteor.methods({
    async 'offline_test.clear'() {
      await Items.removeAsync({});
    },
    async 'offline_test.sleep'(delay) {
      await new Promise((resolve) => Meteor.setTimeout(resolve, delay));
    },
    'offline_test.make_ready'(key) {
      const runs = waiting.get(key);
      if (!runs || runs.size === 0) {
        early.set(key, (early.get(key) || 0) + 1);
        return;
      }
      runs.forEach((ready) => ready());
      runs.clear();
    },
  });
}
