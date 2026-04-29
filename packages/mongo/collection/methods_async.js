export const AsyncMethods = {
  /**
   * @summary Finds the first document that matches the selector, as ordered by sort and skip options. Returns `undefined` if no matching document is found.
   * @locus Anywhere
   * @method findOneAsync
   * @memberof Mongo.Collection
   * @instance
   * @param {MongoSelector} [selector] A query describing the documents to find
   * @param {Object} [options]
   * @param {MongoSortSpecifier} options.sort Sort order (default: natural order)
   * @param {Number} options.skip Number of results to skip at the beginning
   * @param {MongoFieldSpecifier} options.fields Dictionary of fields to return or exclude.
   * @param {Boolean} options.reactive (Client only) Default true; pass false to disable reactivity
   * @param {Function} options.transform Overrides `transform` on the [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation.
   * @param {String} options.readPreference (Server only) Specifies a custom MongoDB [`readPreference`](https://docs.mongodb.com/manual/core/read-preference) for fetching the document. Possible values are `primary`, `primaryPreferred`, `secondary`, `secondaryPreferred` and `nearest`.
   * @returns {Object}
   */
  findOneAsync(...args) {
    return this._collection.findOneAsync(
      this._getFindSelector(args),
      this._getFindOptions(args)
    );
  },

  _insertAsync(doc, options = {}) {
    // Make sure we were passed a document to insert
    if (!doc) {
      throw new Error('insert requires an argument');
    }

    // Make a shallow clone of the document, preserving its prototype.
    doc = Object.create(
      Object.getPrototypeOf(doc),
      Object.getOwnPropertyDescriptors(doc)
    );

    if ('_id' in doc) {
      if (
        !doc._id ||
        !(typeof doc._id === 'string' || doc._id instanceof Mongo.ObjectID)
      ) {
        throw new Error(
          'Meteor requires document _id fields to be non-empty strings or ObjectIDs'
        );
      }
    } else {
      let generateId = true;

      // Don't generate the id if we're the client and the 'outermost' call
      // This optimization saves us passing both the randomSeed and the id
      // Passing both is redundant.
      if (this._isRemoteCollection()) {
        const enclosing = DDP._CurrentMethodInvocation.get();
        if (!enclosing) {
          generateId = false;
        }
      }

      if (generateId) {
        doc._id = this._makeNewID();
      }
    }

    // On inserts, always return the id that we generated; on all other
    // operations, just return the result from the collection.
    var chooseReturnValueFromCollectionResult = function(result) {
      if (Meteor._isPromise(result)) return result;

      if (doc._id) {
        return doc._id;
      }

      // XXX what is this for??
      // It's some iteraction between the callback to _callMutatorMethod and
      // the return value conversion
      doc._id = result;

      return result;
    };

    if (this._isRemoteCollection()) {
      const promise = this._callMutatorMethodAsync('insertAsync', [doc], options);
      promise.then(chooseReturnValueFromCollectionResult);
      promise.stubPromise = promise.stubPromise.then(chooseReturnValueFromCollectionResult);
      promise.serverPromise = promise.serverPromise.then(chooseReturnValueFromCollectionResult);
      return promise;
    }

    // it's my collection.  descend into the collection object
    // and propagate any exception.
    return this._collection.insertAsync(doc)
      .then(chooseReturnValueFromCollectionResult);
  },

  /**
   * @summary Insert a document in the collection.  Returns a promise that will return the document's unique _id when solved.
   * @locus Anywhere
   * @method  insert
   * @memberof Mongo.Collection
   * @instance
   * @param {Object} doc The document to insert. May not yet have an _id attribute, in which case Meteor will generate one for you.
   */
  insertAsync(doc, options) {
    return this._insertAsync(doc, options);
  },


  /**
   * @summary Modify one or more documents in the collection. Returns the number of matched documents.
   * @locus Anywhere
   * @method update
   * @memberof Mongo.Collection
   * @instance
   * @param {MongoSelector} selector Specifies which documents to modify
   * @param {MongoModifier} modifier Specifies how to modify the documents
   * @param {Object} [options]
   * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
   * @param {Boolean} options.upsert True to insert a document if no matching documents are found.
   * @param {Array} options.arrayFilters Optional. Used in combination with MongoDB [filtered positional operator](https://docs.mongodb.com/manual/reference/operator/update/positional-filtered/) to specify which elements to modify in an array field.
   */
  updateAsync(selector, modifier, ...optionsAndCallback) {

    // We've already popped off the callback, so we are left with an array
    // of one or zero items
    const options = { ...(optionsAndCallback[0] || null) };
    let insertedId;
    if (options && options.upsert) {
      // set `insertedId` if absent.  `insertedId` is a Meteor extension.
      if (options.insertedId) {
        if (
          !(
            typeof options.insertedId === 'string' ||
            options.insertedId instanceof Mongo.ObjectID
          )
        )
          throw new Error('insertedId must be string or ObjectID');
        insertedId = options.insertedId;
      } else if (!selector || !selector._id) {
        insertedId = this._makeNewID();
        options.generatedId = true;
        options.insertedId = insertedId;
      }
    }

    selector = Mongo.Collection._rewriteSelector(selector, {
      fallbackId: insertedId,
    });

    if (this._isRemoteCollection()) {
      const args = [selector, modifier, options];

      return this._callMutatorMethodAsync('updateAsync', args, options);
    }

    // it's my collection.  descend into the collection object
    // and propagate any exception.
    // If the user provided a callback and the collection implements this
    // operation asynchronously, then queryRet will be undefined, and the
    // result will be returned through the callback instead.

    return this._collection.updateAsync(
      selector,
      modifier,
      options
    );
  },

  /**
   * @summary Asynchronously removes documents from the collection.
   * @locus Anywhere
   * @method remove
   * @memberof Mongo.Collection
   * @instance
   * @param {MongoSelector} selector Specifies which documents to remove
   */
  removeAsync(selector, options = {}) {
    selector = Mongo.Collection._rewriteSelector(selector);

    if (this._isRemoteCollection()) {
      return this._callMutatorMethodAsync('removeAsync', [selector], options);
    }

    // it's my collection.  descend into the collection1 object
    // and propagate any exception.
    return this._collection.removeAsync(selector);
  },

  /**
   * @summary Asynchronously modifies one or more documents in the collection, or insert one if no matching documents were found. Returns an object with keys `numberAffected` (the number of documents modified)  and `insertedId` (the unique _id of the document that was inserted, if any).
   * @locus Anywhere
   * @method upsert
   * @memberof Mongo.Collection
   * @instance
   * @param {MongoSelector} selector Specifies which documents to modify
   * @param {MongoModifier} modifier Specifies how to modify the documents
   * @param {Object} [options]
   * @param {Boolean} options.multi True to modify all matching documents; false to only modify one of the matching documents (the default).
   */
  async upsertAsync(selector, modifier, options) {
    return this.updateAsync(
      selector,
      modifier,
      {
        ...options,
        _returnObject: true,
        upsert: true,
      });
  },

  /**
   * @summary Gets the number of documents matching the filter. For a fast count of the total documents in a collection see `estimatedDocumentCount`.
   * @locus Anywhere
   * @method countDocuments
   * @memberof Mongo.Collection
   * @instance
   * @param {MongoSelector} [selector] A query describing the documents to count
   * @param {Object} [options] All options are listed in [MongoDB documentation](https://mongodb.github.io/node-mongodb-native/4.11/interfaces/CountDocumentsOptions.html). Please note that not all of them are available on the client.
   * @returns {Promise<number>}
   */
  countDocuments(...args) {
    return this._collection.countDocuments(...args);
  },

  /**
   * @summary Gets an estimate of the count of documents in a collection using collection metadata. For an exact count of the documents in a collection see `countDocuments`.
   * @locus Anywhere
   * @method estimatedDocumentCount
   * @memberof Mongo.Collection
   * @instance
   * @param {Object} [options] All options are listed in [MongoDB documentation](https://mongodb.github.io/node-mongodb-native/4.11/interfaces/EstimatedDocumentCountOptions.html). Please note that not all of them are available on the client.
   * @returns {Promise<number>}
   */
  estimatedDocumentCount(...args) {
    return this._collection.estimatedDocumentCount(...args);
  },
}