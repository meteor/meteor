// Offline persistence for the Meteor PWA scaffold.
//
// Architecture (two collections, merged in the UI):
//   - The server-backed `Mongo.Collection` (e.g. `Todos`) receives data from
//     publications and from Meteor's standard method-simulation pipeline.
//   - A local-only `offlineMirror(store)` (`new Mongo.Collection(null)`)
//     holds two kinds of docs: hydrated-from-IDB (previous session's cache)
//     and offline-typed (user writes made while disconnected). UI helpers
//     merge both via `findMerged()`, deduping by `_id` (server wins).
//
// Why a separate mirror? Raw `_collection.insert` on a server-backed
// collection bypasses Meteor's merge-box, so when the publication later
// delivers the same _id, DDP errors with "Server sent add for existing id".
// Routing offline data through a separate, local-only collection avoids
// that conflict entirely.
//
// When the upstream PR adding `ddp-client._persistentMethodQueueHook` lands,
// callPersistent() can switch to using that hook for cleaner integration —
// the IDB store, drain logic, and mirror-collection pattern stay identical.

import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Tracker } from 'meteor/tracker';

const DB_NAME = 'pwa-scaffold-offline';
const DB_VERSION = 1;
const STORE_QUEUE = '__method_queue';

const knownStores = new Set([STORE_QUEUE]);
const mirrors = new Map();
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const name of knownStores) {
        if (!db.objectStoreNames.contains(name)) {
          const keyPath = name === STORE_QUEUE ? 'key' : '_id';
          db.createObjectStore(name, { keyPath });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbPut(storeName, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, 'readwrite');
    t.objectStore(storeName).put(value);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function idbDelete(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, 'readwrite');
    t.objectStore(storeName).delete(key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function idbGetAll(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, 'readonly');
    const req = t.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// === Local-only mirror collection ===
// Get or create a local-only Mongo.Collection for a given store. Caller can
// insert/update/remove directly on the returned mirror — those are the offline
// optimistic writes the UI will display.
export function offlineMirror(storeName) {
  if (!mirrors.has(storeName)) {
    knownStores.add(storeName);
    mirrors.set(storeName, new Mongo.Collection(null));
  }
  return mirrors.get(storeName);
}

// === Sync ===
// Wire IDB <-> (server-backed coll + offline mirror).
//   - Hydrate the mirror from IDB at boot.
//   - When a server-backed doc appears: write to IDB, remove the mirror copy
//     (server is now authoritative).
//   - When a mirror doc is inserted/updated (offline write): write to IDB.
export async function syncCollection(coll, storeName) {
  const mirror = offlineMirror(storeName);
  await openDb();
  const cached = await idbGetAll(storeName);
  cached.forEach((doc) => {
    if (!mirror.findOne(doc._id) && !coll.findOne(doc._id)) {
      mirror.insert(doc);
    }
  });
  coll.find().observe({
    added(doc) {
      idbPut(storeName, doc).catch((e) => console.warn('[offline] put failed', e));
      if (mirror.findOne(doc._id)) mirror.remove(doc._id);
    },
    changed(doc) {
      idbPut(storeName, doc).catch((e) => console.warn('[offline] put failed', e));
    },
    removed(doc) {
      idbDelete(storeName, doc._id).catch((e) => console.warn('[offline] del failed', e));
    },
  });
  mirror.find().observe({
    added(doc) {
      idbPut(storeName, doc).catch((e) => console.warn('[offline] put failed', e));
    },
    changed(doc) {
      idbPut(storeName, doc).catch((e) => console.warn('[offline] put failed', e));
    },
    removed(doc) {
      // Only delete from IDB if the doc isn't also in the server-backed coll —
      // a removal here usually means "server caught up", IDB will be refreshed
      // via the coll observer.
      if (!coll.findOne(doc._id)) {
        idbDelete(storeName, doc._id).catch((e) => console.warn('[offline] del failed', e));
      }
    },
  });
}

// === Merged read ===
// Returns server docs + mirror docs (mirror entries hidden when a server-backed
// doc with the same _id exists). Applies a single-field sort if given.
export function findMerged(coll, storeName, selector = {}, options = {}) {
  const mirror = offlineMirror(storeName);
  const serverDocs = coll.find(selector, options).fetch();
  const serverIds = new Set(serverDocs.map((d) => d._id));
  const mirrorDocs = mirror.find(selector, options).fetch().filter((d) => !serverIds.has(d._id));
  const all = [...serverDocs, ...mirrorDocs];
  if (options.sort) {
    const [[key, dir]] = Object.entries(options.sort);
    all.sort((a, b) => {
      if (a[key] < b[key]) return -dir;
      if (a[key] > b[key]) return dir;
      return 0;
    });
  }
  return all;
}

// === Persistent method queue ===
// Calls the method directly when connected, queues to IDB otherwise.
export async function callPersistent(name, ...args) {
  if (Meteor.status().connected) {
    return Meteor.callAsync(name, ...args);
  }
  await enqueue(name, args);
  return undefined;
}

async function enqueue(name, args) {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await idbPut(STORE_QUEUE, { key, name, args, queuedAt: Date.now() });
}

let wasConnected = false;
let draining = false;

Tracker.autorun(() => {
  const connected = Meteor.status().connected;
  if (connected && !wasConnected) drainQueue();
  wasConnected = connected;
});

async function drainQueue() {
  if (draining) return;
  draining = true;
  try {
    const items = await idbGetAll(STORE_QUEUE);
    items.sort((a, b) => a.queuedAt - b.queuedAt);
    for (const item of items) {
      try {
        await Meteor.callAsync(item.name, ...item.args);
        await idbDelete(STORE_QUEUE, item.key);
      } catch (e) {
        console.warn('[offline] replay failed for', item.name, e.message || e);
        break;
      }
    }
  } finally {
    draining = false;
  }
}
