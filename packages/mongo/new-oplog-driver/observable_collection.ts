import isEmpty from 'lodash.isempty';
import { DiffSequence } from 'meteor/diff-sequence';
import { EJSON } from 'meteor/ejson';
import { Meteor } from 'meteor/meteor';
import { LocalCollection } from 'meteor/minimongo';
import { MongoIDMap } from './mongo_id_map';

const allowedOptions = ['limit', 'skip', 'sort', 'fields', 'projection'];

export default class ObservableCollection {
  multiplexer: any;
  matcher: any;
  sorter: any;
  cursorDescription: any;
  collectionName: string;
  collection: Mongo.Collection;
  cursor: Mongo.Cursor;
  store!: MongoIDMap;
  selector: any;
  options: any;
  fieldsArray?: string[];
  projectFieldsOnDoc: any;
  isFieldsProjectionByExclusion: boolean | undefined;
  fieldsOfInterest?: true | string[];
  private __isInitialized = false;
  private _projectionFn: any;
  private _sharedProjection: any;
  private _sharedProjectionFn: any;

  constructor({
    multiplexer,
    matcher,
    sorter,
    cursorDescription,
  }: {
    multiplexer: any;
    matcher: any;
    sorter: any;
    cursorDescription: any;
  }) {
    this.multiplexer = multiplexer;
    this.matcher = matcher;
    this.sorter = sorter;
    this.cursorDescription = cursorDescription;

    this.collectionName = this.cursorDescription.collectionName;
    this.collection = Mongo.getCollection(cursorDescription.collectionName);

    if (!this.collection) {
      throw new Meteor.Error(
        `We could not find the collection instance by name: "${
          this.collectionName
        }", the cursor description was: ${JSON.stringify(cursorDescription)}`
      );
    }
  }

  setupCollection() {
    if (!this.collection) {
      throw new Meteor.Error(
        'We could not properly identify the collection by its name: ' +
          this.collectionName +
          '. Make sure you added redis-oplog package before any package that instantiates a collection.'
      );
    }

    this.cursor = this.collection.find(
      this.cursorDescription.selector,
      this.cursorDescription.options
    );

    this.store = new MongoIDMap();
    this.selector = this.cursorDescription.selector || {};

    if (typeof this.selector === 'string') {
      this.selector = { _id: this.selector };
    }

    if (this.cursorDescription.options) {
      this.options = allowedOptions.reduce((acc, option) => {
        if (this.cursorDescription.options[option]) {
          acc[option] = this.cursorDescription.options[option];
        }
        return acc;
      }, {} as any);
    } else {
      this.options = {};
    }

    const fields = this.options.projection || this.options.fields;

    // check for empty projector object and delete.
    if (fields && isEmpty(fields)) {
      delete this.options.projection;
      delete this.options.fields;
    }

    if (fields) {
      this.fieldsArray = Object.keys(fields);

      if (!Array.isArray(this.fieldsArray)) {
        throw new Meteor.Error(
          'We could not properly extract any fields. "projection" or "fields" must be an object. This was provided: ' +
            JSON.stringify(fields)
        );
      }

      this.projectFieldsOnDoc = LocalCollection._compileProjection(fields);
      this.isFieldsProjectionByExclusion = this.fieldProjectionIsExclusion(fields);
    }

    this.fieldsOfInterest = this._getFieldsOfInterest();
    this.__isInitialized = false;

    const projection = fields || {};
    this._projectionFn = LocalCollection._compileProjection(projection); // Projection function, result of combining important fields for selector and
    // existing fields projection

    this._sharedProjection = this.matcher.combineIntoProjection(projection);
    if (this.sorter) {
      this._sharedProjection = this.sorter.combineIntoProjection(this._sharedProjection);
    }
    this._sharedProjectionFn = LocalCollection._compileProjection(this._sharedProjection);
  }

  isEligible(doc: any) {
    if (this.matcher) {
      return this.matcher.documentMatches(doc).result;
    }

    return true;
  }

  async isEligibleByDB(_id: any) {
    if (this.matcher) {
      return !!(await this.collection.findOneAsync(
        Object.assign({}, this.selector, { _id }),
        { fields: { _id: 1 } }
      ));
    }

    return true;
  }

  async init() {
    if (this.__isInitialized) {
      return; // silently do nothing.
    }

    this.__isInitialized = true;
    const data = await this.cursor.fetchAsync();

    for (const doc of data) {
      await this.add(doc, true);
    }
    // This has too much control over multiplexer..
    this.multiplexer.ready();
  }

  contains(docId: string) {
    return this.store.has(docId);
  }

  async add(doc: any, safe = false) {
    if (!safe) {
      if (this.fieldsArray) {
        // projection function clones the document already.
        doc = this.projectFieldsOnDoc(doc);
      } else {
        doc = EJSON.clone(doc);
      }
    }
    this.store.set(doc._id, doc);
    const fields = {...doc};
    delete fields._id;
    await this.multiplexer.added(doc._id, fields);
  }

  /* We use this method when we receive updates for a document that is not yet in the observable collection store */
  async addByIds(docIds: string[]) {
    const { limit, skip, ...cleanedOptions } = this.options;
    const docs = await this.collection
      .find({ _id: { $in: docIds } }, cleanedOptions)
      .fetchAsync();

    for (const docId of docIds) {
      const doc = docs.find((d) => d._id === docId);
      this.store.set(docId, doc);
      if (doc) {
        const fields = {...doc};
        delete fields._id;
        await this.multiplexer.added(doc._id, fields);
      }
    }
  }

  /* Sends over the wire only the top fields of changes, because DDP client doesnt do deep merge.*/
  async change(doc: any) {
    const docId = doc._id;
    const oldDoc = this.store.get(docId);
    if (!oldDoc) {
      return;
    }

    this.store.set(docId, this._sharedProjectionFn(doc));

    const projectedNew = this._projectionFn(doc);
    const projectedOld = this._projectionFn(oldDoc);

    const changed = DiffSequence.makeChangedFields(projectedNew, projectedOld);

    if (!isEmpty(changed)) {
      await this.multiplexer.changed(docId, changed);
    }
  }

  async remove(docId: string) {
    const doc = this.store.pop(docId);
    if (doc) {
      await this.multiplexer.removed(docId);
    }
  }

  clearStore() {
    this.store.clear();
  }

  isLimitReached() {
    if (this.options.limit) {
      const size = this.store.size();
      return size >= this.options.limit;
    }

    return false;
  }

  _getFieldsOfInterest() {
    const fields = this.options.projection || this.options.fields;

    if (!fields) {
      return true;
    }

    // if you have some fields excluded (high chances you don't, but we query for all fields either way)
    // because it can get very tricky with future subscribers that may need some fields
    if (this.isFieldsProjectionByExclusion) {
      return true;
    }

    // if we have options, we surely have fields array
    let fieldsArray = this.fieldsArray!.slice();
    if (Object.keys(this.selector).length > 0) {
      fieldsArray = Array.from(
        new Set([...fieldsArray, ...this.extractFieldsFromFilters(this.selector)])
      );
    }

    return fieldsArray;
  }
  private fieldProjectionIsExclusion(fields: any) {
    return Object.values(fields)[0] !== 1;
  }
  private extractFieldsFromFilters(filters: any) {
    const deepFilterFieldsArray = ['$and', '$or', '$nor'];
    const deepFilterFieldsObject = ['$not'];
    const filterFields: string[] = [];
    Object.keys(filters).forEach((key) => {
      if (key[0] !== '$') {
        filterFields.push(key);
      }
    });

    deepFilterFieldsArray.forEach((field) => {
      if (filters[field]) {
        filters[field].forEach((element: any) => {
          filterFields.push(...this.extractFieldsFromFilters(element));
        });
      }
    });

    deepFilterFieldsObject.forEach((field) => {
      if (filters[field]) {
        filterFields.push(...this.extractFieldsFromFilters(filters[field]));
      }
    });

    return filterFields;
  }
}
