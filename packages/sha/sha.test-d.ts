import { expectTypeOf } from "expect-type";
import { SHA256 } from "./sha";

expectTypeOf(SHA256).parameters.toEqualTypeOf<[string]>();
expectTypeOf(SHA256).returns.toBeString();
