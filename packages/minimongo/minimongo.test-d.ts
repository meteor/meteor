import { expectTypeOf } from "expect-type";
import { Mongo } from "meteor/mongo";
import { IdMap } from "meteor/id-map";
import { MongoID } from "meteor/mongo-id";
import {
  Cursor,
  LocalCollection,
  Matcher,
  Sorter,
  Minimongo,
} from "./minimongo";
import type {
  MinimongoId,
  MinimongoInsertQuery,
  MinimongoObserveCallbacks,
  MinimongoObserveChangesCallbacks,
  MinimongoObserveHandle,
  MinimongoFindOptions,
} from "./minimongo";

type ForwardedLocalCollection<T> = LocalCollection<T>;
declare const forwardedLocal: ForwardedLocalCollection<unknown>;
expectTypeOf(forwardedLocal).toMatchTypeOf<LocalCollection<unknown>>();

expectTypeOf<MinimongoObserveCallbacks>().toBeObject();
expectTypeOf<MinimongoObserveChangesCallbacks>().toBeObject();
expectTypeOf<MinimongoObserveHandle>().toBeObject();
expectTypeOf<MinimongoFindOptions>().toBeObject();

expectTypeOf(Cursor).toBeObject();
expectTypeOf(LocalCollection).toBeObject();
expectTypeOf(Matcher).toBeObject();
expectTypeOf(Sorter).toBeObject();
expectTypeOf(Minimongo).toBeObject();

interface ObjectIdDocument {
  _id?: Mongo.ObjectID;
  name: string;
}

const objectIdCollection = new LocalCollection<ObjectIdDocument>("objects");
expectTypeOf(objectIdCollection.find()).toEqualTypeOf<
  Cursor<ObjectIdDocument>
>();
expectTypeOf(objectIdCollection.insert({ name: "one" })).toEqualTypeOf<
  string | Mongo.ObjectID
>();

interface CachedDocument {
  _id: string;
  value: number;
}

const document: CachedDocument = { _id: "cached", value: 1 };
const unorderedQuery: MinimongoInsertQuery<CachedDocument> = {
  ordered: false,
  results: new IdMap<MinimongoId, CachedDocument>(),
  projectionFn(fields) {
    return fields;
  },
  added(id, fields) {
    expectTypeOf(id).toEqualTypeOf<MinimongoId>();
    expectTypeOf(fields.value).toEqualTypeOf<number | undefined>();
  },
};
expectTypeOf(LocalCollection._insertInResultsSync(unorderedQuery, document)).toBeVoid();
expectTypeOf(LocalCollection._insertInResultsAsync(unorderedQuery, document))
  .toEqualTypeOf<Promise<void>>();

const orderedQuery: MinimongoInsertQuery<CachedDocument> = {
  ...unorderedQuery,
  ordered: true,
  results: [],
  sorter: new Sorter<CachedDocument>({ value: 1 }),
  distances: new IdMap<MinimongoId, number>(),
  async addedBefore(id, fields, before) {
    expectTypeOf(id).toEqualTypeOf<MinimongoId>();
    expectTypeOf(fields.value).toEqualTypeOf<number | undefined>();
    expectTypeOf(before).toEqualTypeOf<MinimongoId | null>();
  },
};
expectTypeOf(LocalCollection._insertInResultsAsync(orderedQuery, document))
  .toEqualTypeOf<Promise<void>>();

const objectIdDocument = {
  _id: new MongoID.ObjectID("0123456789abcdef01234567"),
  value: 1,
};
const otherObjectIdDocument = {
  _id: new MongoID.ObjectID("0123456789abcdef01234568"),
  value: 2,
};
const objectIdDistances = new IdMap<MinimongoId, number>();
objectIdDistances.set(objectIdDocument._id, 1);
objectIdDistances.set(otherObjectIdDocument._id, 2);
const compareObjectIdDocuments = new Sorter<typeof objectIdDocument>({})
  .getComparator({ distances: objectIdDistances });
expectTypeOf(compareObjectIdDocuments(objectIdDocument, otherObjectIdDocument))
  .toBeNumber();

// @ts-expect-error Unordered results need the ID-map insertion boundary.
LocalCollection._insertInResultsSync({ ...unorderedQuery, results: [] }, document);
// @ts-expect-error A restored document must retain the query's document type.
LocalCollection._insertInResultsAsync<CachedDocument>(orderedQuery, { _id: "cached", value: "bad" });

const arbitraryFieldsQuery: MinimongoInsertQuery = {
  ordered: true,
  results: [],
  projectionFn(fields) {
    return fields;
  },
  added() {},
  addedBefore() {},
};
// @ts-expect-error Insertion helpers require an ID even without a specific schema.
LocalCollection._insertInResultsSync(arbitraryFieldsQuery, { value: 1 });
// @ts-expect-error Inserted IDs must be strings or Mongo ObjectIDs.
LocalCollection._insertInResultsAsync(arbitraryFieldsQuery, { _id: 1, value: 1 });
// @ts-expect-error Stored ordered results must retain their IDs.
arbitraryFieldsQuery.results.push({ value: 1 });
// @ts-expect-error Query document types must include the ID used for insertion.
expectTypeOf<MinimongoInsertQuery<{ value: number }>>().toBeObject();
