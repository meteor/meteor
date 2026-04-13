import { expectTypeOf } from "expect-type";
import { Promise as MeteorPromise } from "./promise";

// Class extends the global Promise
declare const p: MeteorPromise<number>;
expectTypeOf(p).toMatchTypeOf<globalThis.Promise<number>>();
expectTypeOf(p.await()).toBeNumber();

// Static: async wraps a function so it returns a MeteorPromise
const wrapped = MeteorPromise.async((x: number) => x.toString());
expectTypeOf(wrapped).parameters.toEqualTypeOf<[number]>();
expectTypeOf(wrapped(1)).toMatchTypeOf<MeteorPromise<string>>();

// Static: asyncApply takes fn + context + args tuple
const applied = MeteorPromise.asyncApply(
  function (this: { k: string }, n: number) {
    return n + this.k;
  },
  { k: "!" },
  [1] as [number]
);
expectTypeOf(applied).toMatchTypeOf<MeteorPromise<string>>();

// Static: await unwraps a PromiseLike synchronously
expectTypeOf(MeteorPromise.await<number>(Promise.resolve(1))).toBeNumber();

// Static: awaitAll unwraps an iterable
expectTypeOf(MeteorPromise.awaitAll<string>(["a", Promise.resolve("b")])).toEqualTypeOf<string[]>();
