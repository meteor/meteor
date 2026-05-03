import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';

import { Todos } from '../imports/api/todos.js';
import './todos.html';

Template.todosPanel.onCreated(function todosOnCreated() {
  this.subscribe('todos.all');
});

Template.todosPanel.helpers({
  todos() {
    return Todos.find({}, { sort: { createdAt: -1 } });
  },
  count() {
    return Todos.find().count();
  },
});

Template.todosPanel.events({
  async 'submit .todo-form'(event) {
    event.preventDefault();
    const input = event.target.elements.text;
    const text = input.value;
    input.value = '';
    try {
      await Meteor.callAsync('todos.insert', text);
    } catch (e) {
      console.error('[todos] insert failed', e);
    }
  },

  async 'change .toggle'(event) {
    const _id = event.currentTarget.dataset.id;
    try {
      await Meteor.callAsync('todos.toggle', _id);
    } catch (e) {
      console.error('[todos] toggle failed', e);
    }
  },

  async 'click .remove'(event) {
    const _id = event.currentTarget.dataset.id;
    try {
      await Meteor.callAsync('todos.remove', _id);
    } catch (e) {
      console.error('[todos] remove failed', e);
    }
  },
});
