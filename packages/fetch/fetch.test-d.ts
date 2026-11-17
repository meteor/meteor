import { expectTypeOf } from "expect-type";
import { fetch, Headers, Request, Response } from "./fetch";

expectTypeOf(fetch).toBeFunction();
expectTypeOf(fetch).parameter(0).toEqualTypeOf<RequestInfo | URL>();
expectTypeOf(fetch).returns.toEqualTypeOf<Promise<Response>>();
expectTypeOf(Headers).toEqualTypeOf<typeof globalThis.Headers>();
expectTypeOf(Request).toEqualTypeOf<typeof globalThis.Request>();
expectTypeOf(Response).toEqualTypeOf<typeof globalThis.Response>();
