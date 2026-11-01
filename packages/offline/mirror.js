import { EJSON } from 'meteor/ejson';
import * as db from './db.js';

// Documents are stored as EJSON so dates, binaries and ObjectIDs survive the
// round trip; the key is the collection name plus the EJSON form of the id.
const keyFor = (collection, id) => `${collection._name}:${EJSON.stringify(id)}`;

// Loads the copy of a collection into Minimongo, skipping the documents already
// there: the stubs of the calls replayed just before have written theirs.
export async function hydrate(collection) {
  const rows = await db.all('documents');
  let count = 0;
  for (const row of rows) {
    if (row.collection !== collection._name) continue;
    const doc = EJSON.parse(row.doc);
    if (collection._collection._docs.has(doc._id)) continue;
    collection._collection.insert(doc);
    count += 1;
  }
  return count;
}

// Keeps the copy in sync with Minimongo from now on. What is already there came
// from the copy itself, so the initial `added` calls are skipped.
export function mirror(collection) {
  const save = (doc) =>
    db
      .put('documents', { key: keyFor(collection, doc._id), collection: collection._name, doc: EJSON.stringify(doc) })
      .catch(db.warn);
  return collection.find().observe({
    _suppress_initial: true,
    added: save,
    changed: save,
    removed: (doc) => db.remove('documents', keyFor(collection, doc._id)).catch(db.warn),
  });
}
