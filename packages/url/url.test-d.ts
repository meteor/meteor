import { expectTypeOf } from "expect-type";
import { URL, URLSearchParams } from "./url";

expectTypeOf(URL).toEqualTypeOf<typeof globalThis.URL>();
expectTypeOf(URLSearchParams).toEqualTypeOf<typeof globalThis.URLSearchParams>();
