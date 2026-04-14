import { expectTypeOf } from "expect-type";
import { MongoID } from "./mongo-id";

expectTypeOf(MongoID).toBeObject();

expectTypeOf(MongoID._looksLikeObjectID).parameters.toEqualTypeOf<[string]>();
expectTypeOf(MongoID._looksLikeObjectID).returns.toBeBoolean();

expectTypeOf<typeof MongoID.ObjectID>().toBeConstructibleWith();
expectTypeOf<typeof MongoID.ObjectID>().toBeConstructibleWith("507f1f77bcf86cd799439011");

const oid = new MongoID.ObjectID();
expectTypeOf(oid).toEqualTypeOf<MongoID.ObjectID>();
expectTypeOf(oid._str).toBeString();
expectTypeOf(oid.equals).parameters.toEqualTypeOf<[MongoID.ObjectID]>();
expectTypeOf(oid.equals).returns.toBeBoolean();
expectTypeOf(oid.toString).returns.toBeString();
expectTypeOf(oid.clone).returns.toEqualTypeOf<MongoID.ObjectID>();
expectTypeOf(oid.typeName).returns.toBeString();
expectTypeOf(oid.getTimestamp).returns.toBeNumber();
expectTypeOf(oid.valueOf).returns.toBeString();
expectTypeOf(oid.toJSONValue).returns.toBeString();
expectTypeOf(oid.toHexString).returns.toBeString();

expectTypeOf(MongoID.idStringify).parameters.toEqualTypeOf<
  [string | MongoID.ObjectID | undefined | number | boolean | null]
>();
expectTypeOf(MongoID.idStringify).returns.toBeString();

expectTypeOf(MongoID.idParse).parameters.toEqualTypeOf<[string]>();
expectTypeOf(MongoID.idParse).returns.toEqualTypeOf<
  string | MongoID.ObjectID | undefined | number | boolean | null
>();
