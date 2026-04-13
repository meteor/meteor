import { expectTypeOf } from "expect-type";
import { Random } from "./random";

// Random — namespace with generator functions
expectTypeOf(Random).toBeObject();

expectTypeOf(Random.id).parameter(0).toEqualTypeOf<number | undefined>();
expectTypeOf(Random.id).returns.toBeString();

expectTypeOf(Random.secret).parameter(0).toEqualTypeOf<number | undefined>();
expectTypeOf(Random.secret).returns.toBeString();

expectTypeOf(Random.fraction).parameters.toEqualTypeOf<[]>();
expectTypeOf(Random.fraction).returns.toBeNumber();

expectTypeOf(Random.hexString).parameter(0).toBeNumber();
expectTypeOf(Random.hexString).returns.toBeString();

// choice has two overloads — array form returns T | undefined, string form returns string
expectTypeOf(Random.choice<number>([1, 2, 3])).toEqualTypeOf<number | undefined>();
expectTypeOf(Random.choice("abc")).toBeString();
