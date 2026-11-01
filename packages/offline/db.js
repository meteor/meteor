import { Meteor } from 'meteor/meteor';

// One IndexedDB database per user. `documents` holds the copy of the mirrored
// collections (one row per document), `calls` the persisted Method queue.
const PREFIX = 'meteor-offline:';
let active = null; // { name, db }

export const nameFor = (userId) => PREFIX + (userId || 'anonymous');

export const warn = (error) => Meteor._debug('[offline] IndexedDB operation failed', error);

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function open(name) {
  const req = indexedDB.open(name, 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore('documents', { keyPath: 'key' });
    req.result.createObjectStore('calls', { keyPath: 'id' });
  };
  return request(req);
}

// Makes the user's database the active one. Resolves with the name of the
// previously active database, or null when nothing changed.
export async function use(userId) {
  const name = nameFor(userId);
  if (active && active.name === name) return null;
  const previous = active;
  active = { name, db: await open(name) };
  if (!previous) return null;
  previous.db.close();
  return previous.name;
}

export const destroy = (name) => request(indexedDB.deleteDatabase(name));

// Writes resolve once the transaction is committed, so a record is on disk
// before the caller moves on.
function write(storeName, run) {
  return new Promise((resolve, reject) => {
    const transaction = active.db.transaction(storeName, 'readwrite');
    run(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

const read = (storeName, run) => request(run(active.db.transaction(storeName).objectStore(storeName)));

export const put = (storeName, value) => write(storeName, (store) => store.put(value));
export const remove = (storeName, key) => write(storeName, (store) => store.delete(key));
export const get = (storeName, key) => read(storeName, (store) => store.get(key));
export const all = (storeName) => read(storeName, (store) => store.getAll());
export const clearAll = () =>
  Promise.all(['documents', 'calls'].map((storeName) => write(storeName, (store) => store.clear())));
