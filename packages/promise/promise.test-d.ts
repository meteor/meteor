import { expectTypeOf } from "expect-type";
import { Promise as MeteorPromise } from "./promise";

expectTypeOf<typeof MeteorPromise>().toBeConstructibleWith(
  (resolve: (v: number) => void) => resolve(1)
);

const p = new MeteorPromise<number>((resolve) => resolve(1));
expectTypeOf(p).toEqualTypeOf<MeteorPromise<number>>();
expectTypeOf(p).toExtend<globalThis.Promise<number>>();

expectTypeOf(p.await).parameters.toEqualTypeOf<[]>();
expectTypeOf(p.await).returns.toBeNumber();

expectTypeOf(MeteorPromise.async).toBeFunction();
expectTypeOf(MeteorPromise.asyncApply).toBeFunction();

expectTypeOf(MeteorPromise.await<number>).parameters.toEqualTypeOf<[PromiseLike<number>]>();
expectTypeOf(MeteorPromise.await<number>).returns.toBeNumber();

expectTypeOf(MeteorPromise.awaitAll<number>).parameters.toEqualTypeOf<
  [Iterable<number | PromiseLike<number>>]
>();
expectTypeOf(MeteorPromise.awaitAll<number>).returns.toEqualTypeOf<number[]>();
