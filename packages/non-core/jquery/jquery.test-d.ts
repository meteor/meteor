import { expectTypeOf } from "expect-type";
import { $, jQuery } from "./jquery";

// jquery exports the jQuery factory under both names.
expectTypeOf($).toBeFunction();
expectTypeOf(jQuery).toBeFunction();
expectTypeOf($.ajax).toBeAny();
expectTypeOf($.fn).toBeAny();

// Without @types/jquery the fallback stays permissive; when @types/jquery is
// installed these global interfaces merge and provide its full fluent API.
$("body").addClass("meteor-ready").find("a").first();
$.ajax({ url: "/health" });
