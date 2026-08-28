import { expectTypeOf } from "expect-type";
import { Mongo } from "meteor/mongo";
import {
  Cursor,
  LocalCollection,
  Matcher,
  Sorter,
  Minimongo,
} from "./minimongo";
import type {
  MinimongoObserveCallbacks,
  MinimongoObserveChangesCallbacks,
  MinimongoObserveHandle,
  MinimongoFindOptions,
} from "./minimongo";

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
