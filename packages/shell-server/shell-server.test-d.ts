import { expectTypeOf } from "expect-type";
import { listen, disable } from "./shell-server";

expectTypeOf(listen).parameters.toEqualTypeOf<[string]>();
expectTypeOf(listen).returns.toBeVoid();

expectTypeOf(disable).parameters.toEqualTypeOf<[string]>();
expectTypeOf(disable).returns.toBeVoid();
