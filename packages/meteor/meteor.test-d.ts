import { expectTypeOf } from "expect-type";
import { Meteor } from "./meteor";
import type { global_Error, Subscription } from "./meteor";

expectTypeOf(Meteor).toBeObject();
expectTypeOf<global_Error>().toEqualTypeOf<Error>();
expectTypeOf<Subscription>().toBeObject();
