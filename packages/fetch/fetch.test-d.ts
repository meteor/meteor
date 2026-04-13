import { expectTypeOf } from "expect-type";
import { fetch, Headers, Request, Response } from "./fetch";

// Each export should alias the matching global constructor / function
expectTypeOf(fetch).toEqualTypeOf<typeof globalThis.fetch>();
expectTypeOf(Headers).toEqualTypeOf<typeof globalThis.Headers>();
expectTypeOf(Request).toEqualTypeOf<typeof globalThis.Request>();
expectTypeOf(Response).toEqualTypeOf<typeof globalThis.Response>();

// Spot-check call shape
expectTypeOf(fetch).parameter(0).toMatchTypeOf<RequestInfo | URL>();
expectTypeOf(fetch).returns.resolves.toMatchTypeOf<Response>();
expectTypeOf(new Headers()).toMatchTypeOf<Headers>();
expectTypeOf(new Request("https://x")).toMatchTypeOf<Request>();
expectTypeOf(new Response()).toMatchTypeOf<Response>();
