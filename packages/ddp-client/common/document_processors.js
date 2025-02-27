import { MongoID } from 'meteor/mongo-id';
import { DiffSequence } from 'meteor/diff-sequence';
import { hasOwn } from "meteor/ddp-common/utils";
import { isEmpty } from "meteor/ddp-common/utils";

export class DocumentProcessors {
  constructor(connection) {
    this._connection = connection;
  }

  /**
   * @summary Process an 'added' message from the server
   * @param {Object} msg The added message
   * @param {Object} updates The updates accumulator
   */
  async _process_added(msg, updates) {
    const self = this._connection;
    const id = MongoID.idParse(msg.id);
    const serverDoc = self._getServerDoc(msg.collection, id);

    if (serverDoc) {
      // Some outstanding stub wrote here.
      const isExisting = serverDoc.document !== undefined;

      serverDoc.document = msg.fields || Object.create(null);
      serverDoc.document._id = id;

      if (self._resetStores) {
        // During reconnect the server is sending adds for existing ids.
        // Always push an update so that document stays in the store after
        // reset. Use current version of the document for this update, so
        // that stub-written values are preserved.
        const currentDoc = await self._stores[msg.collection].getDoc(msg.id);
        if (currentDoc !== undefined) msg.fields = currentDoc;

        self._pushUpdate(updates, msg.collection, msg);
      } else if (isExisting) {
        throw new Error('Server sent add for existing id: ' + msg.id);
      }
    } else {
      self._pushUpdate(updates, msg.collection, msg);
    }
  }

  /**
   * @summary Process a 'changed' message from the server
   * @param {Object} msg The changed message
   * @param {Object} updates The updates accumulator
   */
  _process_changed(msg, updates) {
    const self = this._connection;
    const serverDoc = self._getServerDoc(msg.collection, MongoID.idParse(msg.id));

    if (serverDoc) {
      if (serverDoc.document === undefined) {
        throw new Error('Server sent changed for nonexisting id: ' + msg.id);
      }
      DiffSequence.applyChanges(serverDoc.document, msg.fields);
    } else {
      self._pushUpdate(updates, msg.collection, msg);
    }
  }

  /**
   * @summary Process a 'removed' message from the server
   * @param {Object} msg The removed message
   * @param {Object} updates The updates accumulator
   */
  _process_removed(msg, updates) {
    const self = this._connection;
    const serverDoc = self._getServerDoc(msg.collection, MongoID.idParse(msg.id));

    if (serverDoc) {
      // Some outstanding stub wrote here.
      if (serverDoc.document === undefined) {
        throw new Error('Server sent removed for nonexisting id:' + msg.id);
      }
      serverDoc.document = undefined;
    } else {
      self._pushUpdate(updates, msg.collection, {
        msg: 'removed',
        collection: msg.collection,
        id: msg.id
      });
    }
  }

  /**
   * @summary Process a 'ready' message from the server
   * @param {Object} msg The ready message
   * @param {Object} updates The updates accumulator
   */
  _process_ready(msg, updates) {
    const self = this._connection;

    // Process "sub ready" messages. "sub ready" messages don't take effect
    // until all current server documents have been flushed to the local
    // database. We can use a write fence to implement this.
    msg.subs.forEach((subId) => {
      self._runWhenAllServerDocsAreFlushed(() => {
        const subRecord = self._subscriptions[subId];
        // Did we already unsubscribe?
        if (!subRecord) return;
        // Did we already receive a ready message? (Oops!)
        if (subRecord.ready) return;
        subRecord.ready = true;
        subRecord.readyCallback && subRecord.readyCallback();
        subRecord.readyDeps.changed();
      });
    });
  }

  /**
   * @summary Process an 'updated' message from the server
   * @param {Object} msg The updated message
   * @param {Object} updates The updates accumulator
   */
  _process_updated(msg, updates) {
    const self = this._connection;
    // Process "method done" messages.
    msg.methods.forEach((methodId) => {
      const docs = self._documentsWrittenByStub[methodId] || {};
      Object.values(docs).forEach((written) => {
        const serverDoc = self._getServerDoc(written.collection, written.id);
        if (!serverDoc) {
          throw new Error('Lost serverDoc for ' + JSON.stringify(written));
        }
        if (!serverDoc.writtenByStubs[methodId]) {
          throw new Error(
            'Doc ' +
            JSON.stringify(written) +
            ' not written by method ' +
            methodId
          );
        }
        delete serverDoc.writtenByStubs[methodId];
        if (isEmpty(serverDoc.writtenByStubs)) {
          // All methods whose stubs wrote this method have completed! We can
          // now copy the saved document to the database (reverting the stub's
          // change if the server did not write to this object, or applying the
          // server's writes if it did).

          // This is a fake ddp 'replace' message.  It's just for talking
          // between livedata connections and minimongo.  (We have to stringify
          // the ID because it's supposed to look like a wire message.)
          self._pushUpdate(updates, written.collection, {
            msg: 'replace',
            id: MongoID.idStringify(written.id),
            replace: serverDoc.document
          });
          // Call all flush callbacks.
          serverDoc.flushCallbacks.forEach((c) => {
            c();
          });

          // Delete this completed serverDocument. Don't bother to GC empty
          // IdMaps inside self._serverDocuments, since there probably aren't
          // many collections and they'll be written repeatedly.
          self._serverDocuments[written.collection].remove(written.id);
        }
      });
      delete self._documentsWrittenByStub[methodId];

      // We want to call the data-written callback, but we can't do so until all
      // currently buffered messages are flushed.
      const callbackInvoker = self._methodInvokers[methodId];
      if (!callbackInvoker) {
        throw new Error('No callback invoker for method ' + methodId);
      }

      self._runWhenAllServerDocsAreFlushed(
        (...args) => callbackInvoker.dataVisible(...args)
      );
    });
  }

  /**
   * @summary Push an update to the buffer
   * @private
   * @param {Object} updates The updates accumulator
   * @param {String} collection The collection name
   * @param {Object} msg The update message
   */
  _pushUpdate(updates, collection, msg) {
    if (!hasOwn.call(updates, collection)) {
      updates[collection] = [];
    }
    updates[collection].push(msg);
  }

  /**
   * @summary Get a server document by collection and id
   * @private
   * @param {String} collection The collection name
   * @param {String} id The document id
   * @returns {Object|null} The server document or null
   */
  _getServerDoc(collection, id) {
    const self = this._connection;
    if (!hasOwn.call(self._serverDocuments, collection)) {
      return null;
    }
    const serverDocsForCollection = self._serverDocuments[collection];
    return serverDocsForCollection.get(id) || null;
  }
}