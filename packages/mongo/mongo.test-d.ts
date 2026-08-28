import { expectTypeOf } from "expect-type";
import type { NpmModuleMongodb } from "meteor/npm-mongo";
import { Mongo, MongoInternals, UnionOmit } from "./mongo";

interface Doc {
  _id?: string;
  name: string;
  value: number;
}

interface ObjectIdDoc {
  _id?: Mongo.ObjectID;
  name: string;
}

expectTypeOf<UnionOmit<{ a: 1, b: 2 }, 'a'>>().toEqualTypeOf<{ b: 2 }>();

expectTypeOf<Mongo.OptionalId<Doc>>().toEqualTypeOf<
  { name: string; value: number } & { _id?: any }
>();

expectTypeOf<Mongo.Selector<Doc>>().toEqualTypeOf<NpmModuleMongodb.Filter<Doc>>();
expectTypeOf<Mongo.SortSpecifier>().toEqualTypeOf<NpmModuleMongodb.Sort>();
expectTypeOf<Mongo.FieldSpecifier>().toEqualTypeOf<{ [id: string]: Number }>();
expectTypeOf<Mongo.Transform<Doc>>().toEqualTypeOf<((doc: Doc) => any) | null | undefined>();
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

expectTypeOf(coll.find()).toEqualTypeOf<Mongo.Cursor<Doc, Doc>>();
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
  [string, Function]
>();
expectTypeOf(Mongo.Collection.getExtensions).returns.toEqualTypeOf<
  Array<Function>
>();
expectTypeOf(Mongo.Collection.getPrototypeMethods).returns.toEqualTypeOf<
  Map<string, Function>
>();
expectTypeOf(Mongo.Collection.getStaticMethods).returns.toEqualTypeOf<
  Map<string, Function>
>();
expectTypeOf(Mongo.Collection.clearExtensions).returns.toBeVoid();

// getCollection lives on the Mongo namespace (not as a Collection static)
expectTypeOf(Mongo.getCollection).toBeFunction();
const objectIdCollection = new Mongo.Collection<ObjectIdDoc>("object-id-docs");
expectTypeOf(
  Mongo.getCollection<typeof objectIdCollection>("object-id-docs")
).toEqualTypeOf<typeof objectIdCollection>();
expectTypeOf(
  Mongo.Collection.getCollection<typeof objectIdCollection>("object-id-docs")
).toEqualTypeOf<typeof objectIdCollection>();

// ObjectID
const oid = new Mongo.ObjectID();
expectTypeOf(oid.toHexString()).toBeString();
expectTypeOf(oid.equals(new Mongo.ObjectID())).toBeBoolean();

// MongoInternals
expectTypeOf(MongoInternals).toHaveProperty("defaultRemoteCollectionDriver");
expectTypeOf(MongoInternals.defaultRemoteCollectionDriver).returns.toHaveProperty("mongo");
expectTypeOf(MongoInternals.NpmModules.mongodb.version).toBeString();

// --- Type aliases ---
expectTypeOf<Mongo.Modifier<Doc>>().toEqualTypeOf<NpmModuleMongodb.UpdateFilter<Doc>>();
expectTypeOf<Mongo.DispatchTransform<null, Doc, Doc>>().toEqualTypeOf<Doc>();

// --- Option / callback interfaces ---
expectTypeOf<Mongo.CollectionOptions<Doc>>().toBeObject();
expectTypeOf<Mongo.CursorStatic>().toBeObject();
expectTypeOf<Mongo.ObserveCallbacks<Doc>>().toBeObject();
expectTypeOf<Mongo.ObserveChangesCallbacks<Doc>>().toBeObject();
expectTypeOf<Mongo.AllowDenyOptions<Doc>>().toBeObject();

// --- ObjectID statics ---
expectTypeOf(Mongo.ObjectID).toBeConstructibleWith();
expectTypeOf<Mongo.ObjectIDStatic>().toBeObject();

// --- Collection Extensions ---
expectTypeOf<Mongo.CollectionExtensions>().toBeObject();
expectTypeOf(Mongo.setConnectionOptions).toBeFunction();

// --- MongoInternals ---
expectTypeOf<MongoInternals.MongoConnection>().toBeObject();
expectTypeOf(MongoInternals.NpmModules).toBeObject();
