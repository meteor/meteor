import { Log } from 'meteor/logging';

const isIndexDirection = x =>
  typeof x === 'number' || x === '2d' || x === '2dsphere' || x === 'text' || x === 'geoHaystack';

// Name the driver gives an index created without one, e.g. { a: 1, b: -1 } -> 'a_1_b_-1'
const defaultIndexName = index => {
  const specs = !Array.isArray(index) || (index.length === 2 && isIndexDirection(index[1])) ? [index] : index;
  const key = new Map();
  for (const spec of specs) {
    if (typeof spec === 'string') key.set(spec, 1);
    else if (Array.isArray(spec)) key.set(spec[0], spec[1] ?? 1);
    else if (spec && typeof spec === 'object') for (const [path, direction] of spec instanceof Map ? spec : Object.entries(spec)) key.set(path, direction);
  }
  return [...key].flat().join('_');
};

export const IndexMethods = {
  // We'll actually design an index API later. For now, we just pass through to
  // Mongo's, but make it synchronous.
  /**
   * @summary Asynchronously creates the specified index on the collection.
   * @locus server
   * @method ensureIndexAsync
   * @deprecated in 3.0
   * @memberof Mongo.Collection
   * @instance
   * @param {Object} index A document that contains the field and value pairs where the field is the index key and the value describes the type of index for that field. For an ascending index on a field, specify a value of `1`; for descending index, specify a value of `-1`. Use `text` for text indexes.
   * @param {Object} [options] All options are listed in [MongoDB documentation](https://docs.mongodb.com/manual/reference/method/db.collection.createIndex/#options)
   * @param {String} options.name Name of the index
   * @param {Boolean} options.unique Define that the index values must be unique, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-unique/)
   * @param {Boolean} options.sparse Define that the index is sparse, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-sparse/)
   */
  async ensureIndexAsync(index, options) {
    var self = this;
    if (!self._collection.ensureIndexAsync || !self._collection.createIndexAsync)
      throw new Error('Can only call createIndexAsync on server collections');
    if (self._collection.createIndexAsync) {
      await self._collection.createIndexAsync(index, options);
    } else {
      Log.debug(`ensureIndexAsync has been deprecated, please use the new 'createIndexAsync' instead${ options?.name ? `, index name: ${ options.name }` : `, index: ${ JSON.stringify(index) }` }`)
      await self._collection.ensureIndexAsync(index, options);
    }
  },

  /**
   * @summary Asynchronously creates the specified index on the collection.
   * @locus server
   * @method createIndexAsync
   * @memberof Mongo.Collection
   * @instance
   * @param {Object} index A document that contains the field and value pairs where the field is the index key and the value describes the type of index for that field. For an ascending index on a field, specify a value of `1`; for descending index, specify a value of `-1`. Use `text` for text indexes.
   * @param {Object} [options] All options are listed in [MongoDB documentation](https://docs.mongodb.com/manual/reference/method/db.collection.createIndex/#options)
   * @param {String} options.name Name of the index
   * @param {Boolean} options.unique Define that the index values must be unique, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-unique/)
   * @param {Boolean} options.sparse Define that the index is sparse, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-sparse/)
   */
  async createIndexAsync(index, options) {
    var self = this;
    if (!self._collection.createIndexAsync)
      throw new Error('Can only call createIndexAsync on server collections');

    try {
      await self._collection.createIndexAsync(index, options);
    } catch (e) {
      if (
        e.message.includes(
          'An equivalent index already exists with the same name but different options.'
        ) &&
        Meteor.settings?.packages?.mongo?.reCreateIndexOnOptionMismatch
      ) {
        const indexName = options?.name ?? defaultIndexName(index);
        Log.info(`Re-creating index ${ indexName } for ${ self._name } due to options mismatch.`);
        await self._collection.dropIndexAsync(indexName);
        await self._collection.createIndexAsync(index, options);
      } else {
        console.error(e);
        throw new Meteor.Error(`An error occurred when creating an index for collection "${ self._name }: ${ e.message }`);
      }
    }
  },

  /**
   * @summary Asynchronously creates the specified index on the collection.
   * @locus server
   * @method createIndex
   * @memberof Mongo.Collection
   * @instance
   * @param {Object} index A document that contains the field and value pairs where the field is the index key and the value describes the type of index for that field. For an ascending index on a field, specify a value of `1`; for descending index, specify a value of `-1`. Use `text` for text indexes.
   * @param {Object} [options] All options are listed in [MongoDB documentation](https://docs.mongodb.com/manual/reference/method/db.collection.createIndex/#options)
   * @param {String} options.name Name of the index
   * @param {Boolean} options.unique Define that the index values must be unique, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-unique/)
   * @param {Boolean} options.sparse Define that the index is sparse, more at [MongoDB documentation](https://docs.mongodb.com/manual/core/index-sparse/)
   */
  createIndex(index, options){
    return this.createIndexAsync(index, options);
  },

  async dropIndexAsync(index) {
    var self = this;
    if (!self._collection.dropIndexAsync)
      throw new Error('Can only call dropIndexAsync on server collections');
    await self._collection.dropIndexAsync(index);
  },
}
