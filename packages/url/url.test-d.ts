import { expectTypeOf } from "expect-type";
import { URL, URLSearchParams } from "./url";
import type { URLHelpers } from "./url";

expectTypeOf(URL).toMatchTypeOf<typeof globalThis.URL>();
expectTypeOf(URLSearchParams).toEqualTypeOf<typeof globalThis.URLSearchParams>();
expectTypeOf<URLHelpers>().toBeObject();

expectTypeOf(URL._constructUrl(
  "https://example.com/path?old=1",
  "replacement=1",
  { nested: { value: 1 } },
)).toBeString();
expectTypeOf(URL._encodeParams({ tags: ["one", "two"] })).toBeString();
