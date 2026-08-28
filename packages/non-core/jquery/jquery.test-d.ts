import { expectTypeOf } from "expect-type";
import { $, jQuery } from "./jquery";

// jquery exports the jQuery factory under both names.
expectTypeOf($).toBeFunction();
expectTypeOf(jQuery).toBeFunction();
expectTypeOf($.ajax).toEqualTypeOf<unknown>();
expectTypeOf($.fn).toEqualTypeOf<unknown>();

// Without @types/jquery unknown members remain safe. Installing @types/jquery
// augments these global interfaces with the full fluent API.
expectTypeOf($("body")).toEqualTypeOf<JQuery>();
