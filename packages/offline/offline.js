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

// Opens the user's copy, re-issues the calls recorded before the last unload
// (their stubs restore the optimistic documents), loads the copy into Minimongo
// on boot, and mirrors the collections from now on.
async function activate(userId, { boot }) {
  await db.use(userId);
  handles.forEach((handle) => handle.stop());
  const calls = await queue.replay();
  let documents = 0;
  if (boot) {
    for (const collection of collections) documents += await hydrate(collection);
  }
  handles = collections.map(mirror);
  emit('ready', { userId, calls, documents });
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
    try {
      await activate(currentUserId(), { boot: true });
    } finally {
      // Once the stream is up, the first batch of server data replaces the
      // copy in one paused update, exactly as a reconnection does. The flag is
      // raised at that moment and not before: Meteor also applies it when a
      // stub flushes its writes, which must not empty the copy in the meantime.
      const firstConnection = DDP.onReconnect((reconnecting) => {
        if (reconnecting !== connection) return;
        firstConnection.stop();
        connection._resetStores = true;
      });
      connection.reconnect();
    }
    // Another user means another copy; the previous one is deleted.
    let known = currentUserId();
    Tracker.autorun(() => {
      const userId = currentUserId();
      if (userId === known) return;
      const previous = db.nameFor(known);
      known = userId;
      activate(userId, { boot: false })
        .then(() => db.destroy(previous))
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
