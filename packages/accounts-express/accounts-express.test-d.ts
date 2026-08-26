import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";
import { fetch as meteorFetch } from "meteor/fetch";
import { createAuthMiddleware, fetch, createAuthFetch, handleFetch } from "./accounts-express";
import type { MeteorFetchOptions, AuthMiddlewareOptions } from "./accounts-express";

// Own top-level surface.
expectTypeOf<MeteorFetchOptions>().toBeObject();
expectTypeOf<AuthMiddlewareOptions>().toBeObject();
// createAuthMiddleware/createAuthFetch return functions; the fetch helpers resolve to Response.
expectTypeOf(createAuthMiddleware).returns.toMatchTypeOf<
  (req: any, res: any, next: () => void) => Promise<void>
>();
expectTypeOf(createAuthFetch).returns.toMatchTypeOf<
  (url: string | Request, options?: MeteorFetchOptions) => Promise<Response>
>();
expectTypeOf(fetch).returns.toEqualTypeOf<Promise<Response>>();
expectTypeOf(handleFetch).returns.toEqualTypeOf<Promise<Response>>();

// Members it augments onto other modules.
expectTypeOf(Meteor.fetch).returns.toEqualTypeOf<Promise<Response>>();
expectTypeOf(meteorFetch).returns.toEqualTypeOf<Promise<Response>>();
