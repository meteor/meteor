import { expectTypeOf } from "expect-type";
import { Session } from "./session";

expectTypeOf(Session).toBeObject();

type SessionValue =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | unknown[]
  | Date
  | Uint8Array
  | null
  | undefined;

expectTypeOf(Session.equals).parameters.toEqualTypeOf<
  [string, string | number | boolean | null | undefined]
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
expectTypeOf(Session.set).toBeCallableWith("k", [1, 2, 3]);
expectTypeOf(Session.set).toBeCallableWith({ s: "v", n: 1, b: true, x: null });
expectTypeOf(Session.set).returns.toBeVoid();

// setDefault mirrors set: (key, value) and (object) forms
expectTypeOf(Session.setDefault).toBeCallableWith("k", "v");
expectTypeOf(Session.setDefault).toBeCallableWith({ s: "v", n: 1, b: true, x: null });
expectTypeOf(Session.setDefault).returns.toBeVoid();
