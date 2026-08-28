import { expectTypeOf } from "expect-type";
import { Session } from "./session";
import { Mongo } from "meteor/mongo";
import type { EJSONableProperty } from "meteor/ejson";

expectTypeOf(Session).toBeObject();

type SessionValue = EJSONableProperty;

expectTypeOf(Session.equals).parameters.toEqualTypeOf<
  [string, string | number | boolean | null | undefined | Date | Mongo.ObjectID]
>();
expectTypeOf(Session.equals).returns.toBeBoolean();

expectTypeOf(Session.get).parameters.toEqualTypeOf<[string]>();
expectTypeOf(Session.get).returns.toEqualTypeOf<SessionValue>();

expectTypeOf(Session.set).toBeCallableWith("k", "value");
expectTypeOf(Session.set).toBeCallableWith("k", 42);
expectTypeOf(Session.set).toBeCallableWith("k", true);
expectTypeOf(Session.set).toBeCallableWith("k", null);
expectTypeOf(Session.set).toBeCallableWith("k", undefined);
expectTypeOf(Session.set).toBeCallableWith("k", new Date());
expectTypeOf(Session.set).toBeCallableWith("k", new Uint8Array());
expectTypeOf(Session.set).toBeCallableWith("k", { nested: 1 });
interface NamedSessionPayload {
  nested: number;
}
const namedPayload: NamedSessionPayload = { nested: 1 };
Session.set("named", namedPayload);
interface NamedSessionMap {
  first: NamedSessionPayload;
  second: string;
}
const namedMap: NamedSessionMap = { first: namedPayload, second: "value" };
Session.set(namedMap);
expectTypeOf(Session.set).toBeCallableWith("k", [1, 2, 3]);
const objectId = new Mongo.ObjectID();
expectTypeOf(Session.set).toBeCallableWith("k", objectId);
expectTypeOf(Session.set).toBeCallableWith({ s: "v", n: 1, b: true, x: null });
expectTypeOf(Session.set).returns.toBeVoid();

// setDefault mirrors set: (key, value) and (object) forms
expectTypeOf(Session.setDefault).toBeCallableWith("k", "v");
expectTypeOf(Session.setDefault).toBeCallableWith("k", objectId);
Session.setDefault(namedMap);
expectTypeOf(Session.setDefault).toBeCallableWith({ s: "v", n: 1, b: true, x: null });
expectTypeOf(Session.setDefault).returns.toBeVoid();

expectTypeOf(Session.equals).toBeCallableWith("k", objectId);
