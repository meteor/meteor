import { Template } from 'meteor/templating';

import { Todos } from '../imports/api/todos.js';
import { offlineMirror, syncCollection, findMerged, callPersistent } from './offline.js';
import './todos.html';

const STORE = 'todos-cache';
syncCollection(Todos, STORE);
const mirror = offlineMirror(STORE);

// Tiny client-side ID generator. Matches Meteor's Random.id() format closely
// enough; the scaffold avoids the `random` package import.
function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 17; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

Template.todosPanel.onCreated(function todosOnCreated() {
  this.subscribe('todos.all');
});

Template.todosPanel.helpers({
  todos() {
    return findMerged(Todos, STORE, {}, { sort: { createdAt: -1 } });
  },
  count() {
    return findMerged(Todos, STORE).length;
  },
});

Template.todosPanel.events({
  async 'submit .todo-form'(event) {
    event.preventDefault();
    const input = event.target.elements.text;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const _id = generateId();
    // Optimistic insert into the local mirror — visible immediately even
    // offline. When the server confirms via the publication, the syncCollection
    // observer mirrors the authoritative doc into IDB and removes the
    // duplicate from the mirror.
    mirror.insert({ _id, text, done: false, createdAt: new Date() });
    try {
      await callPersistent('todos.insert', _id, text);
    } catch (e) {
      console.error('[todos] insert failed', e);
    }
  },

  async 'change .toggle'(event) {
    const _id = event.currentTarget.dataset.id;
    if (mirror.findOne(_id)) {
      // Offline-only doc: flip in place; the queued replay will catch up.
      const doc = mirror.findOne(_id);
      mirror.update(_id, { $set: { done: !doc.done } });
    }
    // Server-backed updates round-trip through the method; with no client stub
    // the UI updates a beat later when the publication delivers the change.
    try {
      await callPersistent('todos.toggle', _id);
    } catch (e) {
      console.error('[todos] toggle failed', e);
    }
  },

  async 'click .remove'(event) {
    const _id = event.currentTarget.dataset.id;
    if (mirror.findOne(_id)) mirror.remove(_id);
    try {
      await callPersistent('todos.remove', _id);
    } catch (e) {
      console.error('[todos] remove failed', e);
    }
  },
});
