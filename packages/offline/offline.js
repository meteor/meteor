import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';
import { EJSON } from 'meteor/ejson';
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
let listed = new Set(); // publication names
let readyTimeout = 30_000;

// The subscriptions to the listed publications made while the connection is
// down: on boot, the ones the app makes before the connection is up; later,
// the ones made offline. They become ready as soon as the copy is in
// Minimongo, if it holds documents: their data is the copy's until the
// server's replaces it in one batch, and they stay ready then, as any
// subscription does across a reconnection. On a first start, with nothing on
// the device, they wait for the server as usual, as the subscriptions to the
// other publications always do: their data is not in the copy.
const made = new Set(); // subscription ids
let activating = false; // the boot copy is being loaded
let loaded = false; // the boot copy is in Minimongo
let madeReady = false; // a subscription was made ready from the copy
// The subscriptions made ready from the copy that the server has not answered
// yet, and the publications given up on (see giveUp), with their arguments,
// until the page reloads.
const fromCopy = new Set();
const givenUp = []; // { name, params }
const isGivenUp = (record) =>
  givenUp.some((entry) => entry.name === record.name && EJSON.equals(entry.params, record.params));

const holdsDocuments = () => collections.some((collection) => collection.find({}, { reactive: false }).count() > 0);

function readyFromCopy() {
  if (!loaded) return;
  const held = holdsDocuments();
  made.forEach((id) => {
    const record = Meteor.connection._subscriptions[id];
    if (!held || !record || record.ready || isGivenUp(record)) return;
    // What the server's ready message does. The callback is the app's: its
    // failure stops neither the start nor the other subscriptions. It runs
    // once: not again when the server's ready comes after the subscription was
    // given up on.
    record.ready = true;
    fromCopy.add(id);
    madeReady = true;
    const callback = record.readyCallback;
    record.readyCallback = null;
    try {
      if (callback) callback();
    } catch (error) {
      Meteor._debug('[offline] onReady callback failed', error);
    }
    record.readyDeps.changed();
  });
  made.clear();
}

// The status says connected as soon as the socket opens, a round trip before
// the server's `connected` message that starts the session: until then, a
// subscription is made as without connection.
const beforeSession = (connection) =>
  !Tracker.nonreactive(() => connection.status().connected) || connection._resetStoresOnConnect;

const subscribing = (subscribe) =>
  function (...args) {
    const handle = subscribe.apply(this, args);
    if (listed.has(args[0]) && (activating || loaded) && beforeSession(Meteor.connection)) {
      made.add(handle.subscriptionId);
      // Never ready synchronously: the server's answer is not either.
      Promise.resolve().then(readyFromCopy);
    }
    return handle;
  };

// Installed when the package loads: Meteor.subscribe was bound to the
// connection's original function when ddp-client loaded.
Meteor.connection.subscribe = subscribing(Meteor.connection.subscribe);
Meteor.subscribe = subscribing(Meteor.subscribe);

// Opens the user's copy, loads it into Minimongo on boot, re-issues the calls
// recorded before the last unload (their stubs run against the loaded
// documents), and mirrors the collections from now on. On a login the
// documents already in Minimongo were published again for the new user before
// the login completed, and start the new copy. On a logout they may still be
// the previous user's: Meteor.userId() is cleared as soon as the logout is
// sent, before the server has withdrawn them, so the anonymous copy starts
// empty and fills from the next changes and the next start.
async function activate(userId, { boot }) {
  await db.use(userId);
  handles.forEach((handle) => handle.stop());
  let documents = 0;
  if (boot) {
    for (const collection of collections) documents += await hydrate(collection);
  }
  const calls = await queue.replay();
  handles = collections.map((collection) => mirror(collection, { initial: !boot && userId !== null }));
  if (boot) {
    loaded = true;
    readyFromCopy();
  }
  emit('ready', { userId, calls, documents });
}

const names = (connection, ids) => {
  const shown = ids.slice(0, 5).map((id) => connection._subscriptions[id]?.name || id);
  return ids.length > 5 ? `${shown.join(', ')} and ${ids.length - 5} more` : shown.join(', ');
};

// The server's answers: a subscription it answered is not given up on.
function listenForAnswers(connection) {
  connection._stream.on('message', (raw) => {
    if (fromCopy.size === 0 || typeof raw !== 'string' || !/"msg":"(ready|nosub)"/.test(raw)) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.msg === 'ready' && Array.isArray(msg.subs)) msg.subs.forEach((id) => fromCopy.delete(id));
    if (msg.msg === 'nosub') fromCopy.delete(msg.id);
  });
}

// After a reconnection, DDP holds back every data message, and so the
// callback of every Method, until the server has answered each subscription
// that was ready, and a publication that neither returns a cursor nor calls
// this.ready(), this.stop() or this.error() never answers. The subscriptions
// made ready from the copy are not waited for longer than readyTimeout once
// they are all that holds the data back: the copy is replaced without their
// documents, they are not ready until the server says so, and their
// publication with the same arguments is not made ready from the copy again.
function giveUp(connection, ids) {
  Meteor._debug(
    `[offline] no answer from ${names(connection, ids)} after ${readyTimeout} ms: the copy is replaced without it. ` +
      'A publication listed in Offline.start({ subscriptions }) must return a cursor or [], or call this.ready(), this.stop() or this.error().',
  );
  ids.forEach((id) => {
    const record = connection._subscriptions[id];
    record.ready = false;
    record.readyDeps.changed();
    givenUp.push({ name: record.name, params: record.params });
    fromCopy.delete(id);
  });
  connection._stopWaitingForSubscriptions(ids).catch((error) => Meteor._debug('[offline] could not stop waiting', error));
}

// Checks every half readyTimeout while connected. The wait starts at the
// first check that finds only subscriptions made ready from the copy holding
// the data back: the Methods sent before them (replayed calls, the resume
// login) and the other subscriptions run first on the server.
function watchConnection(connection, copyHeld) {
  let connected = false;
  let connectedAt = 0;
  let timer = null;
  let warned = false;
  let copyChecked = false;
  let aloneSince = null;
  const arm = () => {
    timer = readyTimeout === Infinity ? null : setTimeout(check, Math.min(readyTimeout / 2, 2 ** 31 - 1));
  };

  const check = () => {
    timer = null;
    // A disconnection the autorun has not seen yet: nothing to give up on.
    if (!Tracker.nonreactive(() => connection.status().connected)) return;
    const now = Date.now();
    fromCopy.forEach((id) => {
      if (!connection._subscriptions[id]) fromCopy.delete(id);
    });
    const waiting = Object.keys(connection._subsBeingRevived);
    const alone =
      waiting.length > 0 &&
      waiting.every((id) => fromCopy.has(id)) &&
      Object.keys(connection._methodsBlockingQuiescence).length === 0;
    aloneSince = alone ? (aloneSince ?? now) : null;
    if (alone && now - aloneSince >= readyTimeout) {
      aloneSince = null;
      giveUp(connection, waiting);
    }
    if (Meteor.isDevelopment) {
      if (!copyChecked) {
        copyChecked = true;
        if (copyHeld && !madeReady) {
          Meteor._debug(
            '[offline] the copy holds documents but no subscription to a publication listed in Offline.start({ subscriptions }) was made: ' +
              'the copy was replaced as soon as the connection was up, and its documents come back with their subscriptions',
          );
        }
      }
      const stillWaiting = Object.keys(connection._subsBeingRevived);
      if (!warned && stillWaiting.length > 0 && now - connectedAt >= readyTimeout) {
        warned = true;
        Meteor._debug(`[offline] still waiting for ${names(connection, stillWaiting)} after ${readyTimeout} ms`);
      }
    }
    arm();
  };

  Tracker.autorun(() => {
    const now = connection.status().connected;
    if (now === connected) return;
    connected = now;
    clearTimeout(timer);
    timer = null;
    aloneSince = null;
    if (!connected) return;
    connectedAt = Date.now();
    warned = false;
    arm();
  });
}

export const Offline = {
  // Call it once, at client startup, before subscribing. Resolves once the
  // copy is in Minimongo and the recorded calls are queued; the connection is
  // held back until then so the first server data replaces the copy.
  async start({ collections: mirrored = [], methods = [], subscriptions = [], readyTimeout: timeout = 30_000 } = {}) {
    if (started) throw new Error('Offline.start() has already been called');
    if (typeof timeout !== 'number' || !(timeout > 0)) {
      throw new Error('readyTimeout must be a positive number of milliseconds, or Infinity');
    }
    started = true;
    collections = mirrored;
    listed = new Set(subscriptions);
    readyTimeout = timeout;
    queue.configure(methods, emit);
    const connection = Meteor.connection;
    listenForAnswers(connection);
    connection.disconnect();
    activating = true;
    try {
      await activate(currentUserId(), { boot: true });
    } finally {
      activating = false;
      if (!loaded) made.clear();
      // The copy is replaced by the server's documents the way a reconnection
      // replaces the previous session's: on the `connected` message, the
      // stores are reset together with the data of the subscriptions made
      // ready from the copy, in one paused batch. Not before: a reset asked
      // for earlier would run with the first stub and empty the copy. Without
      // such a subscription the reset is immediate, as on a reconnection, and
      // the subscriptions fill the stores again: a copy nothing replaces would
      // keep the documents deleted while the app was away. Nothing to replace
      // when the stores are empty; whatever they hold is replaced, even if the
      // start failed halfway.
      const copyHeld = holdsDocuments();
      if (copyHeld) connection._resetStoresOnConnect = true;
      connection.reconnect();
      watchConnection(connection, copyHeld);
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

  // For the tests: how long a subscription made ready from the copy is waited
  // for. Returns the previous value.
  _setReadyTimeout(timeout) {
    const previous = readyTimeout;
    readyTimeout = timeout;
    return previous;
  },

  pending: queue.pending,
  failed: queue.failed,
  drop: queue.drop,

  // Empties the current user's copy: documents and recorded calls.
  clear: () => db.clearAll().then(() => undefined),
};
