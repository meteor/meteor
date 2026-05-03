import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

export const Todos = new Mongo.Collection('todos');

if (Meteor.isServer) {
  Meteor.publish('todos.all', function publishTodos() {
    return Todos.find({}, { sort: { createdAt: -1 }, limit: 200 });
  });
}

Meteor.methods({
  async 'todos.insert'(text) {
    if (typeof text !== 'string' || !text.trim()) {
      throw new Meteor.Error('todos.invalid', 'Text required');
    }
    return Todos.insertAsync({
      text: text.trim(),
      done: false,
      createdAt: new Date(),
    });
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
