import { expectTypeOf } from "expect-type";
import type { NpmModuleMongodb } from "meteor/npm-mongo";
import { Mongo, MongoInternals, UnionOmit } from "./mongo";

interface Doc {
  _id?: string;
  name: string;
  value: number;
}

expectTypeOf<UnionOmit<{ a: 1, b: 2 }, 'a'>>().toEqualTypeOf<{ b: 2 }>();

expectTypeOf<Mongo.OptionalId<Doc>>().toEqualTypeOf<
  { name: string; value: number } & { _id?: string | NpmModuleMongodb.ObjectId }
>();

expectTypeOf<Mongo.Selector<Doc>>().toEqualTypeOf<NpmModuleMongodb.Filter<Doc>>();
expectTypeOf<Mongo.SortSpecifier>().toEqualTypeOf<NpmModuleMongodb.Sort>();
expectTypeOf<Mongo.FieldSpecifier>().toEqualTypeOf<{ [id: string]: Number }>();
expectTypeOf<Mongo.Transform<Doc>>().toEqualTypeOf<((doc: Doc) => Doc) | null | undefined>();
expectTypeOf<Mongo.Options<Doc>>().toMatchTypeOf<{ limit?: number }>();

expectTypeOf(Mongo.Collection).toBeConstructibleWith(null);
expectTypeOf(Mongo.Collection).toBeConstructibleWith("name");
expectTypeOf(Mongo.Collection).toBeConstructibleWith("name", {
  idGeneration: "STRING",
});

const coll = new Mongo.Collection<Doc>("docs");
expectTypeOf(coll).toHaveProperty("find");
expectTypeOf(coll).toHaveProperty("findOneAsync");
expectTypeOf(coll).toHaveProperty("insertAsync");
expectTypeOf(coll).toHaveProperty("updateAsync");
expectTypeOf(coll).toHaveProperty("removeAsync");
expectTypeOf(coll).toHaveProperty("upsertAsync");
expectTypeOf(coll).toHaveProperty("rawCollection");
expectTypeOf(coll).toHaveProperty("rawDatabase");

expectTypeOf(coll.find).returns.toEqualTypeOf<Mongo.Cursor<Doc, Doc>>();
expectTypeOf(coll.findOneAsync("id")).resolves.toEqualTypeOf<Doc | undefined>();
expectTypeOf(coll.insertAsync).parameter(0).toEqualTypeOf<Mongo.OptionalId<Doc>>();
expectTypeOf(coll.insertAsync).returns.resolves.toBeString();
expectTypeOf(coll.countDocuments()).resolves.toBeNumber();
expectTypeOf(coll.estimatedDocumentCount()).resolves.toBeNumber();
expectTypeOf(coll.rawCollection()).toEqualTypeOf<NpmModuleMongodb.Collection<Doc>>();
expectTypeOf(coll.rawDatabase()).toEqualTypeOf<NpmModuleMongodb.Db>();

const cursor = coll.find();
expectTypeOf(cursor.fetchAsync()).resolves.toEqualTypeOf<Doc[]>();
expectTypeOf(cursor.countAsync()).resolves.toBeNumber();
expectTypeOf(cursor).toHaveProperty("observe");
expectTypeOf(cursor).toHaveProperty("observeChanges");
expectTypeOf(cursor).toHaveProperty("forEachAsync");
expectTypeOf(cursor).toHaveProperty("mapAsync");

// Transform: U differs from T
const transformed = new Mongo.Collection<Doc, { label: string }>("t", {
  transform: (doc) => ({ label: doc.name }),
});
expectTypeOf(transformed.findOneAsync("id")).resolves.toEqualTypeOf<
  { label: string } | undefined
>();

// Collection Extensions API
expectTypeOf(Mongo.Collection.addExtension).toBeFunction();
expectTypeOf(Mongo.Collection.addPrototypeMethod).parameter(0).toBeString();
expectTypeOf(Mongo.Collection.addStaticMethod).parameters.toEqualTypeOf<
  [string, (...args: unknown[]) => unknown]
>();
expectTypeOf(Mongo.Collection.getExtensions).returns.toEqualTypeOf<
  Array<(...args: unknown[]) => unknown>
>();
expectTypeOf(Mongo.Collection.getPrototypeMethods).returns.toEqualTypeOf<
  Map<string, (...args: unknown[]) => unknown>
>();
expectTypeOf(Mongo.Collection.getStaticMethods).returns.toEqualTypeOf<
  Map<string, (...args: unknown[]) => unknown>
>();
expectTypeOf(Mongo.Collection.clearExtensions).returns.toBeVoid();

// Static getters
expectTypeOf(Mongo.Collection.getCollection).toBeFunction();
expectTypeOf(Mongo.getCollection).toBeFunction();

// ObjectID
const oid = new Mongo.ObjectID();
expectTypeOf(oid.toHexString()).toBeString();
expectTypeOf(oid.equals(new Mongo.ObjectID())).toBeBoolean();

// MongoInternals
expectTypeOf(MongoInternals).toHaveProperty("defaultRemoteCollectionDriver");
expectTypeOf(MongoInternals.defaultRemoteCollectionDriver).returns.toHaveProperty("mongo");
expectTypeOf(MongoInternals.NpmModules.mongodb.version).toBeString();
