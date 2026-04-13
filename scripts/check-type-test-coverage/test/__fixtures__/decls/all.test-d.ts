import type { IFace, Alias, Klass, Enum, Ns } from "./all";
import { fn, CONST_V } from "./all";
import def from "./all";

declare function expectTypeOf<T>(value?: T): void;
declare function expectType<T>(value: T): void;

expectTypeOf<IFace>();
expectTypeOf<Alias>();
expectTypeOf<Klass>();
expectTypeOf<Enum>();
expectTypeOf<Ns.Inner>();
expectType(fn);
expectType(CONST_V);
expectType(def);

// Property-access callee form: covered via ns.expectTypeOf pattern.
declare const ns: { expectTypeOf: typeof expectTypeOf };
ns.expectTypeOf<IFace>();

// Unrecognized: primitive literal type has no declaration symbol.
expectTypeOf<string>();

// Non-matching recognized callee to exercise the unrecognized branch.
expectType("literal");

// Value typed as a type alias — exposes `type.aliasSymbol` in getTypeAtLocation.
declare const aliasValue: Alias;
expectType(aliasValue);
