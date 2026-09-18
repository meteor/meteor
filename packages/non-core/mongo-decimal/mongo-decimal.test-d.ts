import { expectTypeOf } from "expect-type";
import { Decimal } from "./mongo-decimal";

// mongo-decimal exports the Decimal class (decimal.js + EJSON extensions).
expectTypeOf(Decimal).toBeConstructibleWith("1.5");
expectTypeOf(Decimal).toBeConstructibleWith(1.5);
const d = new Decimal("1.5");
expectTypeOf(d.plus(d)).toEqualTypeOf<Decimal>();
expectTypeOf(d.typeName()).toEqualTypeOf<string>();
expectTypeOf(d.toJSONValue()).toEqualTypeOf<string>();
expectTypeOf(d.clone()).toEqualTypeOf<Decimal>();
