import { NpmModuleMongodb } from 'meteor/npm-mongo';
import { Meteor } from 'meteor/meteor';
import { DDP } from 'meteor/ddp';

// Based on https://github.com/microsoft/TypeScript/issues/28791#issuecomment-443520161
export type UnionOmit<T, K extends keyof any> = T extends T
  ? Pick<T, Exclude<keyof T, K>>
  : never;

export namespace Mongo {

  export type Selector<T> = NpmModuleMongodb.Filter<T>;

  type Modifier<T> = NpmModuleMongodb.UpdateFilter<T>;

  export type OptionalId<TSchema> = UnionOmit<TSchema, '_id'> & { _id?: any };

  type SortSpecifier = NpmModuleMongodb.Sort;

  export interface FieldSpecifier {
    [id: string]: Number;
  }

  export type Transform<T> = ((doc: T) => any) | null | undefined;

  export type Options<T> = {
    /** Sort order (default: natural order) */
    sort?: SortSpecifier | undefined;
    /** Number of results to skip at the beginning */
    skip?: number | undefined;
    /** Maximum number of results to return */
    limit?: number | undefined;
    /**
     * Dictionary of fields to return or exclude.
     * @deprecated use projection instead
     */
    fields?: FieldSpecifier | undefined;
    /** Dictionary of fields to return or exclude. */
    projection?: FieldSpecifier | undefined;
    /** (Server only) Overrides MongoDB's default index selection and query optimization process. Specify an index to force its use, either by its name or index specification. */
    hint?: NpmModuleMongodb.Hint | undefined;
    /** (Client only) Default `true`; pass `false` to disable reactivity */
    reactive?: boolean | undefined;
    /**  Overrides `transform` on the  [`Collection`](#collections) for this cursor.  Pass `null` to disable transformation. */
    transform?: Transform<T> | undefined;
  };

  type DispatchTransform<Transform, T, U> = Transform extends (
    ...args: any
  ) => any
    ? ReturnType<Transform>
    : Transform extends null
    ? T
    : U;

  var Collection: CollectionStatic;
  interface CollectionStatic {
    /**
     * Constructor for a Collection
     * @param name The name of the collection. If null, creates an unmanaged (unsynchronized) local collection.
     */
    new <T extends NpmModuleMongodb.Document, U = T>(
      name: string | null,
      options?: {
        /**
         * The server connection that will manage this collection. Uses the default connection if not specified. Pass the return value of calling `DDP.connect` to specify a different
         * server. Pass `null` to specify no connection. Unmanaged (`name` is null) collections cannot specify a connection.
         */
        connection?: DDP.DDPStatic | null | undefined;
        /** The method of generating the `_id` fields of new documents in this collection.  Possible values:
         * - **`'STRING'`**: random strings
         * - **`'MONGO'`**:  random [`Mongo.ObjectID`](#mongo_object_id) values
         *
         * The default id generation technique is `'STRING'`.
         */
        idGeneration?: string | undefined;
        /**
         * An optional transformation function. Documents will be passed through this function before being returned from `fetch` or `findOne`, and before being passed to callbacks of
         * `observe`, `map`, `forEach`, `allow`, and `deny`. Transforms are *not* applied for the callbacks of `observeChanges` or to cursors returned from publish functions.
         */
        transform?: (doc: T) => U;
        /** Set to `false` to skip setting up the mutation methods that enable insert/update/remove from client code. Default `true`. */
        defineMutationMethods?: boolean | undefined;
      }
    ): Collection<T, U>;

    /**
     * Retrieve a previously defined Mongo.Collection instance by its name. The collection must already have been defined with `new Mongo.Collection(name, ...)`.
     * Plain MongoDB collections are not available by this method.
     * @param name The name of the collection instance.
     */
    get<
        TCollection extends Collection<any, any> | undefined = Collection<NpmModuleMongodb.Document> | undefined
    >(name: string): TCollection;
  }
  interface Collection<T extends NpmModuleMongodb.Document, U = T> {
    allow<Fn extends Transform<T> = undefined>(options: {
      insert?:
        | ((userId: string, doc: DispatchTransform<Fn, T, U>) => boolean)
        | undefined;
      update?:
        | ((
            userId: string,
            doc: DispatchTransform<Fn, T, U>,
            fieldNames: string[],
            modifier: any
          ) => boolean)
        | undefined;
      remove?:
        | ((userId: string, doc: DispatchTransform<Fn, T, U>) => boolean)
        | undefined;
      fetch?: string[] | undefined;
      transform?: Fn | undefined;
    }): boolean;
    createCappedCollectionAsync(
      byteSize?: number,
      maxDocuments?: number
    ): Promise<void>;

    /**
     * @deprecated on server since 2.8. Check migration guide {@link https://guide.meteor.com/2.8-migration}
     * @see createIndexAsync
     */
    createIndex(
      indexSpec: NpmModuleMongodb.IndexSpecification,
      options?: NpmModuleMongodb.CreateIndexesOptions
    ): void;
    createIndexAsync(
      indexSpec: NpmModuleMongodb.IndexSpecification,
      options?: NpmModuleMongodb.CreateIndexesOptions
    ): Promise<void>;
    deny<Fn extends Transform<T> = undefined>(options: {
      insert?:
        | ((userId: string, doc: DispatchTransform<Fn, T, U>) => boolean)
        | undefined;
      update?:
        | ((
            userId: string,
            doc: DispatchTransform<Fn, T, U>,
            fieldNames: string[],
            modifier: any
          ) => boolean)
        | undefined;
      remove?:
        | ((userId: string, doc: DispatchTransform<Fn, T, U>) => boolean)
        | undefined;
      fetch?: string[] | undefined;
      transform?: Fn | undefined;
    }): boolean;
    dropCollectionAsync(): Promise<void>;
    dropIndexAsync(indexName: string): Promise<void>;
    /**
     * Find the documents in a collection that match the selector.
     * @param selector A query describing the documents to find
     */
    find(selector?: Selector<T> | ObjectID | string): Cursor<T, U>;
    /**
     * Find the documents in a collection that match the selector.
     * @param selector A query describing the documents to find
     */
    find<O extends Options<T>>(
      selector?: Selector<T> | ObjectID | string,
      options?: O
    ): Cursor<T, DispatchTransform<O['transform'], T, U>>;
    /**
     * Finds the first document that matches the selector, as ordered by sort and skip options. Returns `undefined` if no matching document is found.
     * @deprecated on server since 2.8. Check migration guide {@link https://guide.meteor.com/2.8-migration}
     * @see findOneAsync
     * @param selector A query describing the documents to find
     */
    findOne(selector?: Selector<T> | ObjectID | string): U | undefined;
    /**
     * Finds the first document that matches the selector, as ordered by sort and skip options. Returns `undefined` if no matching document is found.
     * @deprecated on server since 2.8. Check migration guide {@link https://guide.meteor.com/2.8-migration}
     * @see findOneAsync
     * @param selector A query describing the documents to find
     */
    findOne<O extends Omit<Options<T>, 'limit'>>(
      selector?: Selector<T> | ObjectID | string,
      options?: O
    ): DispatchTransform<O['transform'], T, U> | undefined;
    /**
     * Finds the first document that matches the selector, as ordered by sort and skip options. Returns `undefined` if no matching document is found.
     * @param selector A query describing the documents to find
     */
    findOneAsync(
      selector?: Selector<T> | ObjectID | string
    ): Promise<U | undefined>;
    /**
     * Finds the first document that matches the selector, as ordered by sort and skip options. Returns `undefined` if no matching document is found.
     * @param selector A query describing the documents to find
     */
    findOneAsync<O extends Omit<Options<T>, 'limit'>>(
      selector?: Selector<T> | ObjectID | string,
      options?: O
    ): Promise<DispatchTransform<O['transform'], T, U> | undefined>;
    /**
     * Gets the number of documents matching the filter. For a fast count of the total documents in a collection see `estimatedDocumentCount`.
     * @param selector The query for filtering the set of documents to count
     * @param options All options are listed in [MongoDB documentation](https://mongodb.github.io/node-mongodb-native/4.11/interfaces/CountDocumentsOptions.html). Please note that not all of them are available on the client.
     */
    countDocuments(selector?: Selector<T> | ObjectID | string, options?: NpmModuleMongodb.CountDocumentsOptions): Promise<number>;
    /**
     * Gets an estimate of the count of documents in a collection using collection metadata. For an exact count of the documents in a collection see `countDocuments`.
     * @param options All options are listed in [MongoDB documentation](https://mongodb.github.io/node-mongodb-native/4.11/interfaces/CountDocumentsOptions.html). Please note that not all of them are available on the client.
     */
    estimatedDocumentCount(options?: NpmModuleMongodb.EstimatedDocumentCountOptions): Promise<number>;
    /**
     * Insert a document in the collection.  Returns its unique _id.
     * @deprecated on server since 2.8. Check migration guide {@link https://guide.meteor.com/2.8-migration}
     * @see insertAsync
     * @param doc The document to insert. May not yet have an _id attribute, in which case Meteor will generate one for you.
     * @param callback If present, called with an error object as the first argument and, if no error, the _id as the second.
     */
    insert(doc: OptionalId<T>, callback?: Function): string;
    /**
     * Insert a document in the collection.  Returns its unique _id.
     * @param doc The document to insert. May not yet have an _id attribute, in which case Meteor will generate one for you.
     * @param callback If present, called with an error object as the first argument and, if no error, the _id as the second.
     */
    insertAsync(doc: OptionalId<T>, callback?: Function): Promise<string>;
    /**
     * Returns the [`Collection`](http://mongodb.github.io/node-mongodb-native/3.0/api/Collection.html) object corresponding to this collection from the
     * [npm `mongodb` driver module](https://www.npmjs.com/package/mongodb) which is wrapped by `Mongo.Collection`.
     */
    rawCollection(): NpmModuleMongodb.Collection<T>;
    /**
     * Returns the [`Db`](http://mongodb.github.io/node-mongodb-native/3.0/api/Db.html) object corresponding to this collection's database connection from the
     * [npm `mongodb` driver module](https://www.npmjs.com/package/mongodb) which is wrapped by `Mongo.Collection`.
     */
    rawDatabase(): NpmModuleMongodb.Db;
    /**
     * Remove documents from the collection
     * @deprecated on server since 2.8. Check migration guide {@link https://guide.meteor.com/2.8-migration}
     * @see removeAsync
     * @param selector Specifies which documents to remove
     * @param callback If present, called with an error object as its argument.
     */
    remove(
      selector: Selector<T> | ObjectID | string,
      callback?: Function
    ): number;
    /**
     * Remove documents from the collection
     * @param selector Specifies which documents to remove
     * @param callback If present, called with an error object as its argument.
     */
    removeAsync(
      selector: Selector<T> | ObjectID | string,
      callback?: Function
    ): Promise<number>;
    /**
     * Modify one or more documents in the collection. Returns the number of matched documents.
     * @deprecated on server since 2.8. Check migration guide {@link https://guide.meteor.com/2.8-migration}
     * @see updateAsync
     * @param selector Specifies which documents to modify
     * @param modifier Specifies how to modify the documents
     * @param callback If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
     */
    update(
      selector: Selector<T> | ObjectID | string,
      modifier: Modifier<T>,
      options?: {
        /** True to modify all matching documents; false to only modify one of the matching documents (the default). */
        multi?: boolean | undefined;
        /** True to insert a document if no matching documents are found. */
        upsert?: boolean | undefined;
        /**
         * Used in combination with MongoDB [filtered positional operator](https://docs.mongodb.com/manual/reference/operator/update/positional-filtered/) to specify which elements to
         * modify in an array field.
         */
        arrayFilters?: { [identifier: string]: any }[] | undefined;
      },
      callback?: Function
    ): number;
    /**
     * Modify one or more documents in the collection. Returns the number of matched documents.
     * @param selector Specifies which documents to modify
     * @param modifier Specifies how to modify the documents
     * @param callback If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
     */
    updateAsync(
      selector: Selector<T> | ObjectID | string,
      modifier: Modifier<T>,
      options?: {
        /** True to modify all matching documents; false to only modify one of the matching documents (the default). */
        multi?: boolean | undefined;
        /** True to insert a document if no matching documents are found. */
        upsert?: boolean | undefined;
        /**
         * Used in combination with MongoDB [filtered positional operator](https://docs.mongodb.com/manual/reference/operator/update/positional-filtered/) to specify which elements to
         * modify in an array field.
         */
        arrayFilters?: { [identifier: string]: any }[] | undefined;
      },
      callback?: Function
    ): Promise<number>;
    /**
     * Modify one or more documents in the collection, or insert one if no matching documents were found. Returns an object with keys `numberAffected` (the number of documents modified) and
     * `insertedId` (the unique _id of the document that was inserted, if any).
     * @deprecated on server since 2.8. Check migration guide {@link https://guide.meteor.com/2.8-migration}
     * @see upsertAsync
     * @param selector Specifies which documents to modify
     * @param modifier Specifies how to modify the documents
     * @param callback If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
     */
    upsert(
      selector: Selector<T> | ObjectID | string,
      modifier: Modifier<T>,
      options?: {
        /** True to modify all matching documents; false to only modify one of the matching documents (the default). */
        multi?: boolean | undefined;
      },
      callback?: Function
    ): {
      numberAffected?: number | undefined;
      insertedId?: string | undefined;
    };
    /**
     * Modify one or more documents in the collection, or insert one if no matching documents were found. Returns an object with keys `numberAffected` (the number of documents modified) and
     * `insertedId` (the unique _id of the document that was inserted, if any).
     * @param selector Specifies which documents to modify
     * @param modifier Specifies how to modify the documents
     * @param callback If present, called with an error object as the first argument and, if no error, the number of affected documents as the second.
     */
    upsertAsync(
      selector: Selector<T> | ObjectID | string,
      modifier: Modifier<T>,
      options?: {
        /** True to modify all matching documents; false to only modify one of the matching documents (the default). */
        multi?: boolean | undefined;
      },
      callback?: Function
    ): Promise<{
      numberAffected?: number | undefined;
      insertedId?: string | undefined;
    }>;
    _createCappedCollection(byteSize?: number, maxDocuments?: number): void;
    /** @deprecated */
    _ensureIndex(
      indexSpec: NpmModuleMongodb.IndexSpecification,
      options?: NpmModuleMongodb.CreateIndexesOptions
    ): void;
    _dropCollection(): Promise<void>;
    /**
     * @deprecated on server since 2.8. Check migration guide {@link https://guide.meteor.com/2.8-migration}
     * @see dropIndexAsync
     */
    _dropIndex(indexName: string): void;
  }

  var Cursor: CursorStatic;
  interface CursorStatic {
    /**
     * To create a cursor, use find. To access the documents in a cursor, use forEach, map, or fetch.
     */
    new <T, U = T>(): Cursor<T, U>;
  }
  interface ObserveCallbacks<T> {
    added?(document: T): void;
    addedAt?(document: T, atIndex: number, before: T | null): void;
    changed?(newDocument: T, oldDocument: T): void;
    changedAt?(newDocument: T, oldDocument: T, indexAt: number): void;
    removed?(oldDocument: T): void;
    removedAt?(oldDocument: T, atIndex: number): void;
    movedTo?(
      document: T,
      fromIndex: number,
      toIndex: number,
      before: T | null
    ): void;
  }
  interface ObserveChangesCallbacks<T> {
    added?(id: string, fields: Partial<T>): void;
    addedBefore?(id: string, fields: Partial<T>, before: T | null): void;
    changed?(id: string, fields: Partial<T>): void;
    movedBefore?(id: string, before: T | null): void;
    removed?(id: string): void;
  }
  interface Cursor<T, U = T> {
    /**
     * Returns the number of documents that match a query.
     * @param applySkipLimit If set to `false`, the value returned will reflect the total number of matching documents, ignoring any value supplied for limit. (Default: true)
     */
    count(applySkipLimit?: boolean): number;
    /**
     * Returns the number of documents that match a query.
     * @param applySkipLimit If set to `false`, the value returned will reflect the total number of matching documents, ignoring any value supplied for limit. (Default: true)
     */
    countAsync(applySkipLimit?: boolean): Promise<number>;
    /**
     * Return all matching documents as an Array.
     */
    fetch(): Array<U>;
    /**
     * Return all matching documents as an Array.
     */
    fetchAsync(): Promise<Array<U>>;
    /**
     * Call `callback` once for each matching document, sequentially and
     *          synchronously.
     * @param callback Function to call. It will be called with three arguments: the document, a 0-based index, and <em>cursor</em> itself.
     * @param thisArg An object which will be the value of `this` inside `callback`.
     */
    forEach(
      callback: (doc: U, index: number, cursor: Cursor<T, U>) => void,
      thisArg?: any
    ): void;
    /**
     * Call `callback` once for each matching document, sequentially and
     *          synchronously.
     * @param callback Function to call. It will be called with three arguments: the document, a 0-based index, and <em>cursor</em> itself.
     * @param thisArg An object which will be the value of `this` inside `callback`.
     */
    forEachAsync(
      callback: (doc: U, index: number, cursor: Cursor<T, U>) => void,
      thisArg?: any
    ): Promise<void>;
    /**
     * Map callback over all matching documents. Returns an Array.
     * @param callback Function to call. It will be called with three arguments: the document, a 0-based index, and <em>cursor</em> itself.
     * @param thisArg An object which will be the value of `this` inside `callback`.
     */
    map<M>(
      callback: (doc: U, index: number, cursor: Cursor<T, U>) => M,
      thisArg?: any
    ): Array<M>;
    /**
     * Map callback over all matching documents. Returns an Array.
     * @param callback Function to call. It will be called with three arguments: the document, a 0-based index, and <em>cursor</em> itself.
     * @param thisArg An object which will be the value of `this` inside `callback`.
     */
    mapAsync<M>(
      callback: (doc: U, index: number, cursor: Cursor<T, U>) => M,
      thisArg?: any
    ): Promise<Array<M>>;
    /**
     * Watch a query. Receive callbacks as the result set changes.
     * @param callbacks Functions to call to deliver the result set as it changes
     */
    observe(callbacks: ObserveCallbacks<U>): Meteor.LiveQueryHandle;
    /**
     * Watch a query. Receive callbacks as the result set changes.
     * @param callbacks Functions to call to deliver the result set as it changes
     */
    observeAsync(callbacks: ObserveCallbacks<U>): Promise<Meteor.LiveQueryHandle>;
    /**
     * Watch a query. Receive callbacks as the result set changes. Only the differences between the old and new documents are passed to the callbacks.
     * @param callbacks Functions to call to deliver the result set as it changes
     */
    observeChanges(
      callbacks: ObserveChangesCallbacks<T>,
      options?: { nonMutatingCallbacks?: boolean | undefined }
    ): Meteor.LiveQueryHandle;
    [Symbol.iterator](): Iterator<T>;
    [Symbol.asyncIterator](): AsyncIterator<T>;
    /**
     * Watch a query. Receive callbacks as the result set changes. Only the differences between the old and new documents are passed to the callbacks.
     * @param callbacks Functions to call to deliver the result set as it changes
     * @param options { nonMutatingCallbacks: boolean }
     */
    observeChangesAsync(
      callbacks: ObserveChangesCallbacks<T>,
      options?: { nonMutatingCallbacks?: boolean | undefined }
    ): Promise<Meteor.LiveQueryHandle>;
  }

  var ObjectID: ObjectIDStatic;
  interface ObjectIDStatic {
    /**
             * Create a Mongo-style `ObjectID`.  If you don't specify a `hexString`, the `ObjectID` will generated randomly (not using MongoDB's ID construction rules).

             * @param hexString The 24-character hexadecimal contents of the ObjectID to create
             */
    new (hexString?: string): ObjectID;
  }
  interface ObjectID {
    toHexString(): string;
    equals(otherID: ObjectID): boolean;
  }

  function setConnectionOptions(options: any): void;
}

export namespace Mongo {
  interface AllowDenyOptions {
    insert?: ((userId: string, doc: any) => boolean) | undefined;
    update?:
      | ((
          userId: string,
          doc: any,
          fieldNames: string[],
          modifier: any
        ) => boolean)
      | undefined;
    remove?: ((userId: string, doc: any) => boolean) | undefined;
    fetch?: string[] | undefined;
    transform?: Function | null | undefined;
  }
}

export declare module MongoInternals {
  interface MongoConnection {
    db: NpmModuleMongodb.Db;
    client: NpmModuleMongodb.MongoClient;
  }

  function defaultRemoteCollectionDriver(): {
    mongo: MongoConnection;
  };

  var NpmModules: {
    mongodb: {
      version: string;
      module: typeof NpmModuleMongodb;
    };
  };
}
