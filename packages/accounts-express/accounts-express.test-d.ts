import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";
import { fetch as meteorFetch } from "meteor/fetch";
import { createAuthMiddleware, fetch, createAuthFetch, handleFetch } from "./accounts-express";
import type { MeteorFetchOptions, AuthMiddlewareOptions } from "./accounts-express";

// Own top-level surface.
expectTypeOf<MeteorFetchOptions>().toBeObject();
expectTypeOf<AuthMiddlewareOptions>().toBeObject();
expectTypeOf(createAuthMiddleware).toBeFunction();
expectTypeOf(fetch).toBeFunction();
expectTypeOf(createAuthFetch).toBeFunction();
expectTypeOf(handleFetch).toBeFunction();

// Members it augments onto other modules.
expectTypeOf(Meteor.fetch).toBeFunction();
expectTypeOf(meteorFetch).toBeFunction();
