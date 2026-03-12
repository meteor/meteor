export const ReplicationMethods = {
  async _maybeSetUpReplication(name) {
    const self = this;
    if (
      !(
        self._connection &&
        self._connection.registerStoreClient &&
        self._connection.registerStoreServer
      )
    ) {
      return;
    }


    const wrappedStoreCommon = {
      // Called around method stub invocations to capture the original versions
      // of modified documents.
      saveOriginals() {
        self._collection.saveOriginals();
      },
      retrieveOriginals() {
        return self._collection.retrieveOriginals();
      },
      // To be able to get back to the collection from the store.
      _getCollection() {
        return self;
      },
    };
    const wrappedStoreClient = {
      // Called at the beginning of a batch of updates. batchSize is the number
      // of update calls to expect.
      //
      // XXX This interface is pretty janky. reset probably ought to go back to
      // being its own function, and callers shouldn't have to calculate
      // batchSize. The optimization of not calling pause/remove should be
      // delayed until later: the first call to update() should buffer its
      // message, and then we can either directly apply it at endUpdate time if
      // it was the only update, or do pauseObservers/apply/apply at the next
      // update() if there's another one.
      async beginUpdate(batchSize, reset) {
        // pause observers so users don't see flicker when updating several
        // objects at once (including the post-reconnect reset-and-reapply
        // stage), and so that a re-sorting of a query can take advantage of the
        // full _diffQuery moved calculation instead of applying change one at a
        // time.
        if (batchSize > 1 || reset) self._collection.pauseObservers();

        if (reset) await self._collection.remove({});
      },

      // Apply an update.
      // XXX better specify this interface (not in terms of a wire message)?
      update(msg) {
        var mongoId = MongoID.idParse(msg.id);
        var doc = self._collection._docs.get(mongoId);

        //When the server's mergebox is disabled for a collection, the client must gracefully handle it when:
        // *We receive an added message for a document that is already there. Instead, it will be changed
        // *We reeive a change message for a document that is not there. Instead, it will be added
        // *We receive a removed messsage for a document that is not there. Instead, noting wil happen.

        //Code is derived from client-side code originally in peerlibrary:control-mergebox
        //https://github.com/peerlibrary/meteor-control-mergebox/blob/master/client.coffee

        //For more information, refer to discussion "Initial support for publication strategies in livedata server":
        //https://github.com/meteor/meteor/pull/11151
        if (Meteor.isClient) {
          if (msg.msg === 'added' && doc) {
            msg.msg = 'changed';
          } else if (msg.msg === 'removed' && !doc) {
            return;
          } else if (msg.msg === 'changed' && !doc) {
            msg.msg = 'added';
            const _ref = msg.fields;
            for (let field in _ref) {
              const value = _ref[field];
              if (value === void 0) {
                delete msg.fields[field];
              }
            }
          }
        }
        // Is this a "replace the whole doc" message coming from the quiescence
        // of method writes to an object? (Note that 'undefined' is a valid
        // value meaning "remove it".)
        if (msg.msg === 'replace') {
          var replace = msg.replace;
          if (!replace) {
            if (doc) self._collection.remove(mongoId);
          } else if (!doc) {
            self._collection.insert(replace);
          } else {
            // XXX check that replace has no $ ops
            self._collection.update(mongoId, replace);
          }
          return;
        } else if (msg.msg === 'added') {
          if (doc) {
            throw new Error(
              'Expected not to find a document already present for an add'
            );
          }
          self._collection.insert({ _id: mongoId, ...msg.fields });
        } else if (msg.msg === 'removed') {
          if (!doc)
            throw new Error(
              'Expected to find a document already present for removed'
            );
          self._collection.remove(mongoId);
        } else if (msg.msg === 'changed') {
          if (!doc) throw new Error('Expected to find a document to change');
          const keys = Object.keys(msg.fields);
          if (keys.length > 0) {
            var modifier = {};
            keys.forEach(key => {
              const value = msg.fields[key];
              if (EJSON.equals(doc[key], value)) {
                return;
              }
              if (typeof value === 'undefined') {
                if (!modifier.$unset) {
                  modifier.$unset = {};
                }
                modifier.$unset[key] = 1;
              } else {
                if (!modifier.$set) {
                  modifier.$set = {};
                }
                modifier.$set[key] = value;
              }
            });
            if (Object.keys(modifier).length > 0) {
              self._collection.update(mongoId, modifier);
            }
          }
        } else {
          throw new Error("I don't know how to deal with this message");
        }
      },

      // Called at the end of a batch of updates.livedata_connection.js:1287
      endUpdate() {
        self._collection.resumeObserversClient();
      },

      // Used to preserve current versions of documents across a store reset.
      getDoc(id) {
        return self.findOne(id);
      },

      ...wrappedStoreCommon,
    };
    const wrappedStoreServer = {
      async beginUpdate(batchSize, reset) {
        if (batchSize > 1 || reset) self._collection.pauseObservers();

        if (reset) await self._collection.removeAsync({});
      },

      async update(msg) {
        var mongoId = MongoID.idParse(msg.id);
        var doc = self._collection._docs.get(mongoId);

        // Is this a "replace the whole doc" message coming from the quiescence
        // of method writes to an object? (Note that 'undefined' is a valid
        // value meaning "remove it".)
        if (msg.msg === 'replace') {
          var replace = msg.replace;
          if (!replace) {
            if (doc) await self._collection.removeAsync(mongoId);
          } else if (!doc) {
            await self._collection.insertAsync(replace);
          } else {
            // XXX check that replace has no $ ops
            await self._collection.updateAsync(mongoId, replace);
          }
          return;
        } else if (msg.msg === 'added') {
          if (doc) {
            throw new Error(
              'Expected not to find a document already present for an add'
            );
          }
          await self._collection.insertAsync({ _id: mongoId, ...msg.fields });
        } else if (msg.msg === 'removed') {
          if (!doc)
            throw new Error(
              'Expected to find a document already present for removed'
            );
          await self._collection.removeAsync(mongoId);
        } else if (msg.msg === 'changed') {
          if (!doc) throw new Error('Expected to find a document to change');
          const keys = Object.keys(msg.fields);
          if (keys.length > 0) {
            var modifier = {};
            keys.forEach(key => {
              const value = msg.fields[key];
              if (EJSON.equals(doc[key], value)) {
                return;
              }
              if (typeof value === 'undefined') {
                if (!modifier.$unset) {
                  modifier.$unset = {};
                }
                modifier.$unset[key] = 1;
              } else {
                if (!modifier.$set) {
                  modifier.$set = {};
                }
                modifier.$set[key] = value;
              }
            });
            if (Object.keys(modifier).length > 0) {
              await self._collection.updateAsync(mongoId, modifier);
            }
          }
        } else {
          throw new Error("I don't know how to deal with this message");
        }
      },

      // Called at the end of a batch of updates.
      async endUpdate() {
        await self._collection.resumeObserversServer();
      },

      // Used to preserve current versions of documents across a store reset.
      async getDoc(id) {
        return self.findOneAsync(id);
      },
      ...wrappedStoreCommon,
    };


    // OK, we're going to be a slave, replicating some remote
    // database, except possibly with some temporary divergence while
    // we have unacknowledged RPC's.
    let registerStoreResult;
    if (Meteor.isClient) {
      registerStoreResult = self._connection.registerStoreClient(
        name,
        wrappedStoreClient
      );
    } else {
      registerStoreResult = self._connection.registerStoreServer(
        name,
        wrappedStoreServer
      );
    }

    const message = `There is already a collection named "${name}"`;
    const logWarn = () => {
      console.warn ? console.warn(message) : console.log(message);
    };

    if (!registerStoreResult) {
      return logWarn();
    }

    return registerStoreResult?.then?.(ok => {
      if (!ok) {
        logWarn();
      }
    });
  },
}