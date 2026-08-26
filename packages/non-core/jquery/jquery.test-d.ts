import { expectTypeOf } from "expect-type";
import { $, jQuery } from "./jquery";

// jquery exports the jQuery factory under both names.
expectTypeOf($).toBeFunction();
expectTypeOf(jQuery).toBeFunction();
expectTypeOf($.ajax).toBeFunction();
expectTypeOf($.fn).toBeObject();
