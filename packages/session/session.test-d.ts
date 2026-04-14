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

expectTypeOf(Session.set).parameters.toEqualTypeOf<[string, SessionValue]>();
expectTypeOf(Session.set).returns.toBeVoid();

expectTypeOf(Session.setDefault).parameters.toEqualTypeOf<[string, SessionValue]>();
expectTypeOf(Session.setDefault).returns.toBeVoid();
