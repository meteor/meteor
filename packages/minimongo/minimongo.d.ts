import { Mongo } from 'meteor/mongo';

export type MinimongoId = string | Mongo.ObjectID;

export interface MinimongoObserveCallbacks<T = Record<string, unknown>> {
  added?: (document: T) => void;
  addedAt?: (document: T, atIndex: number, before: MinimongoId | null) => void;
  changed?: (newDocument: T, oldDocument: T) => void;
  changedAt?: (newDocument: T, oldDocument: T, atIndex: number) => void;
  movedTo?: (document: T, fromIndex: number, toIndex: number, before: MinimongoId | null) => void;
  removed?: (oldDocument: T) => void;
  removedAt?: (oldDocument: T, atIndex: number) => void;
  _suppress_initial?: boolean;
}

export interface MinimongoObserveChangesCallbacks<T = Record<string, unknown>> {
  added?: (id: MinimongoId, fields: Partial<T>) => void;
  addedBefore?: (id: MinimongoId, fields: Partial<T>, before: MinimongoId | null) => void;
  changed?: (id: MinimongoId, fields: Partial<T>) => void;
  movedBefore?: (id: MinimongoId, before: MinimongoId | null) => void;
  removed?: (id: MinimongoId) => void;
}

export interface MinimongoObserveHandle {
  stop(): void;
}

export interface MinimongoFindOptions<T = Record<string, unknown>> {
  sort?: Mongo.SortSpecifier;
  skip?: number;
  limit?: number;
  fields?: Mongo.FieldSpecifier;
  projection?: Mongo.FieldSpecifier;
  reactive?: boolean;
  transform?: ((doc: T) => T) | null;
}

export class Cursor<T = any> {
  collection: LocalCollection<T>;

  fetch(): T[];
  fetchAsync(): Promise<T[]>;

  count(): number;
  countAsync(): Promise<number>;

  forEach(callback: (doc: T, index: number, cursor: Cursor<T>) => void, thisArg?: unknown): void;
  forEachAsync(callback: (doc: T, index: number, cursor: Cursor<T>) => void | Promise<void>, thisArg?: unknown): Promise<void>;

  map<U>(callback: (doc: T, index: number, cursor: Cursor<T>) => U, thisArg?: unknown): U[];
  mapAsync<U>(callback: (doc: T, index: number, cursor: Cursor<T>) => U | Promise<U>, thisArg?: unknown): Promise<U[]>;

  observe(callbacks: MinimongoObserveCallbacks<T>): MinimongoObserveHandle;
  observeAsync(callbacks: MinimongoObserveCallbacks<T>): Promise<MinimongoObserveHandle>;

  observeChanges(callbacks: MinimongoObserveChangesCallbacks<T>): MinimongoObserveHandle;
  observeChangesAsync(callbacks: MinimongoObserveChangesCallbacks<T>): Promise<MinimongoObserveHandle>;

  [Symbol.iterator](): Iterator<T>;
  [Symbol.asyncIterator](): AsyncIterator<T>;
}

export class LocalCollection<T = any> {
  constructor(name?: string);

  name: string | undefined;
  paused: boolean;

  find(selector?: Mongo.Selector<T> | Mongo.ObjectID | string, options?: MinimongoFindOptions<T>): Cursor<T>;

  findOne(selector?: Mongo.Selector<T> | Mongo.ObjectID | string, options?: MinimongoFindOptions<T>): T | undefined;
  findOneAsync(selector?: Mongo.Selector<T> | Mongo.ObjectID | string, options?: MinimongoFindOptions<T>): Promise<T | undefined>;

  insert(doc: T, callback?: (err: Error | null, id?: MinimongoId) => void): MinimongoId;
  insertAsync(doc: T, callback?: (err: Error | null, id?: MinimongoId) => void): Promise<MinimongoId>;

  update(
    selector: Mongo.Selector<T> | Mongo.ObjectID | string,
    modifier: Mongo.Modifier<T>,
    options?: { multi?: boolean; upsert?: boolean; arrayFilters?: { [identifier: string]: unknown }[] },
    callback?: (err: Error | null, numAffected?: number) => void
  ): number;

  updateAsync(
    selector: Mongo.Selector<T> | Mongo.ObjectID | string,
    modifier: Mongo.Modifier<T>,
    options?: { multi?: boolean; upsert?: boolean; arrayFilters?: { [identifier: string]: unknown }[] },
    callback?: (err: Error | null, numAffected?: number) => void
  ): Promise<number>;

  upsert(
    selector: Mongo.Selector<T> | Mongo.ObjectID | string,
    modifier: Mongo.Modifier<T>,
    options?: { multi?: boolean },
    callback?: (err: Error | null, result?: { numberAffected?: number; insertedId?: MinimongoId }) => void
  ): { numberAffected?: number; insertedId?: MinimongoId };

  upsertAsync(
    selector: Mongo.Selector<T> | Mongo.ObjectID | string,
    modifier: Mongo.Modifier<T>,
    options?: { multi?: boolean },
    callback?: (err: Error | null, result?: { numberAffected?: number; insertedId?: MinimongoId }) => void
  ): Promise<{ numberAffected?: number; insertedId?: MinimongoId }>;

  remove(selector: Mongo.Selector<T> | Mongo.ObjectID | string, callback?: (err: Error | null, numRemoved?: number) => void): number;
  removeAsync(selector: Mongo.Selector<T> | Mongo.ObjectID | string, callback?: (err: Error | null, numRemoved?: number) => void): Promise<number>;

  countDocuments(selector?: Mongo.Selector<T>, options?: MinimongoFindOptions<T>): Promise<number>;
  estimatedDocumentCount(options?: MinimongoFindOptions<T>): Promise<number>;

  pauseObservers(): void;
  resumeObserversClient(): void;
  resumeObserversServer(): Promise<void>;

  saveOriginals(): void;
  retrieveOriginals(): Map<MinimongoId, T | undefined>;
}

export class Matcher<T = Record<string, unknown>> {
  constructor(selector: Mongo.Selector<T>);

  documentMatches(doc: T): { result: boolean; arrayIndices?: number[] };

  hasGeoQuery(): boolean;
  hasWhere(): boolean;
  isSimple(): boolean;

  combineIntoProjection(projection: Mongo.FieldSpecifier): Mongo.FieldSpecifier;
}

export class Sorter<T = Record<string, unknown>> {
  constructor(spec: Mongo.SortSpecifier, collation?: object);

  getComparator(options?: { distances?: Map<string, number> }): (a: T, b: T) => number;

  affectedByModifier(modifier: Mongo.Modifier<T>): boolean;
}

export const Minimongo: {
  LocalCollection: typeof LocalCollection;
  Matcher: typeof Matcher;
  Sorter: typeof Sorter;
};
