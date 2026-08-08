import { expectTypeOf } from "expect-type";
import { Promise as MeteorPromise } from "./promise";

expectTypeOf<typeof MeteorPromise>().toBeConstructibleWith(
  (resolve: (v: number) => void) => resolve(1)
);

const p = new MeteorPromise<number>((resolve) => resolve(1));
expectTypeOf(p).toEqualTypeOf<MeteorPromise<number>>();
expectTypeOf(p).toExtend<globalThis.Promise<number>>();

// `done` is the only Meteor-added prototype method: terminal then-like, returns void.
expectTypeOf(p.done).returns.toBeVoid();
expectTypeOf(p.done).toBeCallableWith((v: number) => void v);
