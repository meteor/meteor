import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp-client';
import { Tracker } from 'meteor/tracker';
import * as db from './db.js';
import { hydrate, mirror } from './mirror.js';
import * as queue from './queue.js';

const listeners = new Map();

function emit(type, payload) {
  const set = listeners.get(type);
  if (!set) return;
  set.forEach((listener) => {
    try {
      listener({ type, ...payload });
    } catch (error) {
      Meteor._debug('[offline] listener failed', error);
    }
  });
}

const currentUserId = () => (typeof Meteor.userId === 'function' ? Meteor.userId() : null);

let collections = [];
let handles = [];
let started = false;

// Opens the user's copy, loads it into Minimongo on boot, re-issues the calls
// recorded before the last unload (their stubs run against the loaded
// documents), and mirrors the collections from now on. On a user change the
// documents already in Minimongo are the new user's and start the new copy.
async function activate(userId, { boot }) {
  await db.use(userId);
  handles.forEach((handle) => handle.stop());
  let documents = 0;
  if (boot) {
    for (const collection of collections) documents += await hydrate(collection);
  }
  const calls = await queue.replay();
  handles = collections.map((collection) => mirror(collection, { initial: !boot }));
  emit('ready', { userId, calls, documents });
  return documents;
}

export const Offline = {
  // Call it once, at client startup, before subscribing. Resolves once the
  // copy is in Minimongo and the recorded calls are queued; the connection is
  // held back until then so the first server data replaces the copy.
  async start({ collections: mirrored = [], methods = [] } = {}) {
    if (started) throw new Error('Offline.start() has already been called');
    started = true;
    collections = mirrored;
    queue.configure(methods, emit);
    const connection = Meteor.connection;
    connection.disconnect();
    let documents = 0;
    try {
      documents = await activate(currentUserId(), { boot: true });
    } finally {
      // The copy is replaced by the server's documents the way a reconnection
      // replaces the previous session's: once the stream is up, the current
      // subscriptions are treated as revived and the stores are reset together
      // with their data, in one paused batch. Nothing to replace when the copy
      // was empty or when nothing is subscribed yet.
      if (documents > 0) {
        const firstConnection = DDP.onReconnect((reconnecting) => {
          if (reconnecting !== connection) return;
          firstConnection.stop();
          if (Object.keys(connection._subscriptions).length === 0) return;
          connection._resetStores = true;
          connection._reviveAllSubscriptions = true;
        });
      }
      connection.reconnect();
    }
    // Another user means another copy; the previous one is deleted. Changes
    // are applied one after the other, so a quick A, logout, A again cannot
    // delete the copy being reopened.
    let known = currentUserId();
    let switching = Promise.resolve();
    Tracker.autorun(() => {
      const userId = currentUserId();
      if (userId === known) return;
      const previous = db.nameFor(known);
      known = userId;
      switching = switching
        .then(() => activate(userId, { boot: false }))
        .then(() => (db.currentName() === previous ? undefined : db.destroy(previous)))
        .catch(db.warn);
    });
  },

  on(type, listener) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(listener);
    return { stop: () => listeners.get(type).delete(listener) };
  },

  pending: queue.pending,
  failed: queue.failed,
  drop: queue.drop,

  // Empties the current user's copy: documents and recorded calls.
  clear: () => db.clearAll().then(() => undefined),
};
