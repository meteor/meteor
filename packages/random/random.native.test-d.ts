import { expectTypeOf } from "expect-type";
import { Random } from "./random.native";

expectTypeOf(Random).toBeObject();

expectTypeOf(Random.id).parameters.toEqualTypeOf<[(number | undefined)?]>();
expectTypeOf(Random.id).returns.toBeString();

expectTypeOf(Random.secret).parameters.toEqualTypeOf<[(number | undefined)?]>();
expectTypeOf(Random.secret).returns.toBeString();

expectTypeOf(Random.fraction).parameters.toEqualTypeOf<[]>();
expectTypeOf(Random.fraction).returns.toBeNumber();

expectTypeOf(Random.hexString).parameters.toEqualTypeOf<[number]>();
expectTypeOf(Random.hexString).returns.toBeString();

expectTypeOf(Random.choice<number>([1, 2, 3])).toEqualTypeOf<number | undefined>();
expectTypeOf(Random.choice("abc")).toBeString();

// --- choice (bare reference for coverage)
expectTypeOf(Random.choice).toBeFunction();

// --- insecure generator + createWithSeeds (added)
expectTypeOf<Random.RandomGenerator>().toBeObject();
expectTypeOf(Random.insecure).toEqualTypeOf<Random.RandomGenerator>();
expectTypeOf(Random.createWithSeeds).returns.toEqualTypeOf<Random.RandomGenerator>();
// @ts-expect-error At least one seed is required by the runtime.
Random.createWithSeeds();
