import { expectTypeOf } from "expect-type";
import { fetch, Headers, Request, Response } from "./fetch";

expectTypeOf(fetch).toEqualTypeOf<typeof globalThis.fetch>();
expectTypeOf(Headers).toEqualTypeOf<typeof globalThis.Headers>();
expectTypeOf(Request).toEqualTypeOf<typeof globalThis.Request>();
expectTypeOf(Response).toEqualTypeOf<typeof globalThis.Response>();
