import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";
import { fetch as meteorFetch } from "meteor/fetch";
import { createAuthMiddleware, fetch, createAuthFetch, handleFetch } from "./accounts-express";
import type {
  MeteorFetchOptions,
  AuthMiddlewareOptions,
  RequestAuth,
  RestApiSettings,
} from "./accounts-express";

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

createAuthMiddleware({ required: true, apiTokens: true });
createAuthMiddleware({ apiTokens: false });
createAuthMiddleware({ apiTokens: { scopes: ["reports:read"] } });
// @ts-expect-error Route scopes are a list of names, not a single scope.
createAuthMiddleware({ apiTokens: { scopes: "reports:read" } });
// @ts-expect-error API token opt-in requires a boolean or declared scopes.
createAuthMiddleware({ apiTokens: {} });

const restSettings: RestApiSettings = {
  enabled: true,
  loginPath: "/auth/login",
  logoutPath: "/auth/logout",
};
expectTypeOf(restSettings.enabled).toEqualTypeOf<boolean | undefined>();
expectTypeOf(restSettings.loginPath).toEqualTypeOf<string | undefined>();
expectTypeOf(restSettings.logoutPath).toEqualTypeOf<string | undefined>();
// @ts-expect-error Enabling REST endpoints requires a boolean.
restSettings.enabled = "true";
// @ts-expect-error Paths must be strings.
restSettings.loginPath = false;
// @ts-expect-error API token permissions belong to individual routes.
restSettings.apiTokens = true;

declare const auth: RequestAuth;
if (auth.type === "apiToken") {
  expectTypeOf(auth.tokenId).toBeString();
  expectTypeOf(auth.scopes).toEqualTypeOf<string[] | null>();
  // @ts-expect-error Authentication metadata does not expose credentials.
  expectTypeOf(auth.token);
} else {
  expectTypeOf(auth).toEqualTypeOf<{ type: "session" }>();
}
