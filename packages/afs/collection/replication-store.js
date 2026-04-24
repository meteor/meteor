/**
 * DDP replication stores for FederatedCollection.
 *
 * A "store" is the object DDP's mergebox calls to apply authoritative
 * server messages onto the local document state. Client and server
 * paths differ only in:
 *   - sync (insert/update/remove) vs async (…Async) collection ops
 *   - the client-side mergebox-disabled message rewrite
 *
 * `makeClientStore` / `makeServerStore` return the store object. Both
 * delegate to `applyDdpMessage`, which is parameterized by the sync/async
 * op surface — so a bug in the DDP dispatch only needs one fix.
 */

/**
 * Rewrite DDP messages that arrive against a mergebox-disabled client.
 * Called from the client store ONLY. On the server this is a no-op.
 *
 * @private
 */
function _rewriteForMergeboxDisabled(msg, docExists) {
  if (!Meteor.isClient) return msg;
  if (msg.msg === 'added' && docExists) {
    return { ...msg, msg: 'changed' };
  }
  if (msg.msg === 'removed' && !docExists) return null; // drop
  if (msg.msg === 'changed' && !docExists) {
    const filteredFields = {};
    if (msg.fields) {
      for (const field in msg.fields) {
        const value = msg.fields[field];
        if (value !== void 0) filteredFields[field] = value;
      }
    }
    return { ...msg, msg: 'added', fields: filteredFields };
  }
  return msg;
}

/**
 * Dispatch a single DDP mergebox message onto the backing store.
 *
 * `ops` is the sync/async surface: { getDoc, insert, update, remove }.
 *   - getDoc(id) may return a doc or a promise-of-doc — `await` handles both.
 *   - insert/update/remove may be sync or async — `await` handles both.
 *
 * @private
 */
async function applyDdpMessage(msg, doc, ops) {
  const id = ops.id;

  if (msg.msg === 'replace') {
    const replace = msg.replace;
    if (!replace) {
      if (doc) await ops.remove(id);
    } else if (!doc) {
      await ops.insert(replace);
    } else {
      await ops.update(id, replace);
    }
    return;
  }

  if (msg.msg === 'added') {
    if (doc) throw new Error('Expected not to find a document already present for an add');
    await ops.insert({ _id: id, ...msg.fields });
    return;
  }

  if (msg.msg === 'removed') {
    if (!doc) throw new Error('Expected to find a document already present for removed');
    await ops.remove(id);
    return;
  }

  if (msg.msg === 'changed') {
    if (!doc) throw new Error('Expected to find a document to change');
    const keys = Object.keys(msg.fields);
    if (keys.length === 0) return;
    const modifier = {};
    for (const key of keys) {
      const value = msg.fields[key];
      if (EJSON.equals(doc[key], value)) continue;
      if (typeof value === 'undefined') {
        if (!modifier.$unset) modifier.$unset = {};
        modifier.$unset[key] = 1;
      } else {
        if (!modifier.$set) modifier.$set = {};
        modifier.$set[key] = value;
      }
    }
    if (Object.keys(modifier).length > 0) {
      await ops.update(id, modifier);
    }
    return;
  }

  throw new Error("I don't know how to deal with this message");
}

function _commonStore(collection) {
  return {
    saveOriginals() { collection._collection.saveOriginals(); },
    retrieveOriginals() { return collection._collection.retrieveOriginals(); },
    _getCollection() { return collection; },
  };
}

/**
 * Build the client-side DDP store for a FederatedCollection.
 * Uses synchronous insert/update/remove on LocalCollection.
 */
export function makeClientStore(collection) {
  const lc = collection._collection;

  return {
    async beginUpdate(batchSize, reset) {
      if (batchSize > 1 || reset) lc.pauseObservers();
      if (reset) await lc.remove({});
      collection.emit('replication:batch-started', { batchSize, reset });
    },

    async update(msg) {
      const id = MongoID.idParse(msg.id);
      const doc = lc._docs.get(id);

      const rewritten = _rewriteForMergeboxDisabled(msg, !!doc);
      if (rewritten === null) return; // dropped

      await applyDdpMessage(rewritten, doc, {
        id,
        insert: (d) => lc.insert(d),
        update: (i, m) => lc.update(i, m),
        remove: (i) => lc.remove(i),
      });

      collection.emit('replication:update', { msg: rewritten.msg, id: msg.id });
    },

    endUpdate() {
      lc.resumeObserversClient();
      collection.emit('replication:batch-ended');
    },

    async getDoc(id) {
      return collection.findOneAsync(id);
    },

    ..._commonStore(collection),
  };
}

/**
 * Build the server-side DDP store for a FederatedCollection.
 * Uses async insert/update/remove on whatever backing `_collection`
 * exposes (provider adapter or LocalCollection).
 */
export function makeServerStore(collection) {
  const backing = collection._collection;

  return {
    async beginUpdate(batchSize, reset) {
      if (batchSize > 1 || reset) backing.pauseObservers();
      if (reset) await backing.removeAsync({});
      collection.emit('replication:batch-started', { batchSize, reset });
    },

    async update(msg) {
      const id = MongoID.idParse(msg.id);
      // _docs.get may be sync (LocalCollection) or async (provider adapter).
      const doc = await backing._docs.get(id);

      await applyDdpMessage(msg, doc, {
        id,
        insert: (d) => backing.insertAsync(d),
        update: (i, m) => backing.updateAsync(i, m),
        remove: (i) => backing.removeAsync(i),
      });

      collection.emit('replication:update', { msg: msg.msg, id: msg.id });
    },

    async endUpdate() {
      await backing.resumeObserversServer();
      collection.emit('replication:batch-ended');
    },

    async getDoc(id) {
      return collection.findOneAsync(id);
    },

    ..._commonStore(collection),
  };
}
