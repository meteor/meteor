import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

export const Todos = new Mongo.Collection('todos');

if (Meteor.isServer) {
  Meteor.publish('todos.all', function publishTodos() {
    return Todos.find({}, { sort: { createdAt: -1 }, limit: 200 });
  });

  // Server-only methods (no client stub). The scaffold uses the offline
  // mirror collection (see client/offline.js) for optimistic UI, so the
  // standard Meteor stub-write tracking would actively interfere by
  // double-inserting into the server-backed `Todos` collection and tripping
  // the merge-box's "Server sent add for existing id" error when the
  // publication later delivers the same doc.
  Meteor.methods({
    // Accepts a client-generated `_id` so the call is idempotent on replay
    // (e.g. an offline write is drained from the IDB queue after reconnect).
    async 'todos.insert'(_id, text) {
      if (typeof _id !== 'string' || !_id) {
        throw new Meteor.Error('todos.invalid', '_id required');
      }
      if (typeof text !== 'string' || !text.trim()) {
        throw new Meteor.Error('todos.invalid', 'Text required');
      }
      try {
        return await Todos.insertAsync({
          _id,
          text: text.trim(),
          done: false,
          createdAt: new Date(),
        });
      } catch (e) {
        const msg = String(e?.message || e);
        if (e?.code === 11000 || /duplicate key|already exists/i.test(msg)) {
          return _id; // idempotent replay
        }
        throw e;
      }
    },

    async 'todos.toggle'(_id) {
      if (typeof _id !== 'string') {
        throw new Meteor.Error('todos.invalid', '_id required');
      }
      const todo = await Todos.findOneAsync({ _id });
      if (!todo) throw new Meteor.Error('todos.notFound', 'Todo not found');
      return Todos.updateAsync({ _id }, { $set: { done: !todo.done } });
    },

    async 'todos.remove'(_id) {
      if (typeof _id !== 'string') {
        throw new Meteor.Error('todos.invalid', '_id required');
      }
      return Todos.removeAsync({ _id });
    },
  });
}
