import { EJSON } from 'meteor/ejson';
import * as db from './db.js';

// Documents are stored as EJSON so dates, binaries and ObjectIDs survive the
// round trip; the key is the collection name plus the EJSON form of the id.
const keyFor = (collection, id) => `${collection._name}:${EJSON.stringify(id)}`;

// Loads the copy of a collection into Minimongo, in one paused batch, skipping
// the documents already there.
export async function hydrate(collection) {
  const rows = await db.allBy('documents', 'collection', collection._name);
  const local = collection._collection;
  let count = 0;
  local.pauseObservers();
  try {
    for (const row of rows) {
      const doc = EJSON.parse(row.doc);
      if (local._docs.has(doc._id)) continue;
      local.insert(doc);
      count += 1;
    }
  } finally {
    local.resumeObserversClient();
  }
  return count;
}

// Keeps the copy in sync with Minimongo from now on. On boot the documents
// already there came from the copy itself, so the initial `added` calls are
// skipped; on a user change they are the new user's copy and are written.
export function mirror(collection, { initial = false } = {}) {
  const save = (doc) =>
    db
      .put('documents', { key: keyFor(collection, doc._id), collection: collection._name, doc: EJSON.stringify(doc) })
      .catch(db.warn);
  // Raw documents: a collection transform must not reach the copy.
  return collection.find({}, { transform: null }).observe({
    _suppress_initial: !initial,
    added: save,
    changed: save,
    removed: (doc) => db.remove('documents', keyFor(collection, doc._id)).catch(db.warn),
  });
}
