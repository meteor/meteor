import * as http from "http";
import { expectTypeOf } from "expect-type";
import { OAuth, OAuthTest } from "./oauth";
import type {
  OAuthLoginStyle,
  OAuthStateParam,
  OAuthPopupDimensions,
  OAuthLaunchLoginOptions,
  OAuthDataAfterRedirect,
  OAuthServiceUrls,
  OAuthHandlerResult,
  OAuth1RequestHandler,
  OAuth2RequestHandler,
  OAuthRequestHandler,
  OAuthRegisteredService,
  OAuthVersionRequestHandler,
  OAuthCredential,
  OAuthPendingCredentialDocument,
} from "./oauth";
import { OAuth1Binding } from "../oauth1/oauth1";

expectTypeOf<OAuthLoginStyle>().toEqualTypeOf<"popup" | "redirect">();
expectTypeOf<OAuthStateParam>().toBeObject();
expectTypeOf<OAuthPopupDimensions>().toBeObject();
expectTypeOf<OAuthLaunchLoginOptions>().toBeObject();
expectTypeOf<OAuthDataAfterRedirect>().toBeObject();
expectTypeOf<OAuthServiceUrls>().toBeObject();
expectTypeOf<OAuthHandlerResult>().toBeObject();
expectTypeOf<OAuth1RequestHandler>().toBeFunction();
expectTypeOf<OAuth2RequestHandler>().toBeFunction();
expectTypeOf<OAuthRequestHandler>().toBeFunction();
expectTypeOf<OAuthRegisteredService>().toBeObject();
expectTypeOf<OAuthVersionRequestHandler>().toBeFunction();
expectTypeOf<OAuthCredential>().toBeObject();
expectTypeOf<OAuthPendingCredentialDocument>().toBeObject();

expectTypeOf(OAuth).toBeObject();
expectTypeOf(OAuthTest).toBeObject();

// The redirect flow never reads the completion callback; the popup flow needs it.
OAuth.launchLogin({ loginService: "x", loginStyle: "redirect", loginUrl: "u", credentialToken: "t" });
OAuth.launchLogin({
  loginService: "x",
  loginStyle: "popup",
  loginUrl: "u",
  credentialToken: "t",
  credentialRequestCompleteCallback: (credentialToken) => {
    expectTypeOf(credentialToken).toEqualTypeOf<string>();
  },
  popupOptions: { height: 600 },
});
// Providers pass the style resolved by `OAuth._loginStyle` together with the callback.
declare const resolvedLoginStyle: OAuthLoginStyle;
OAuth.launchLogin({
  loginService: "google",
  loginStyle: resolvedLoginStyle,
  loginUrl: "u",
  credentialToken: "t",
  credentialRequestCompleteCallback: () => {},
  popupOptions: { height: 600 },
});
// @ts-expect-error the popup flow binds the completion callback
OAuth.launchLogin({ loginService: "x", loginStyle: "popup", loginUrl: "u", credentialToken: "t" });

// OAuth 2 handlers receive the raw callback query, OAuth 1 handlers the binding plus the query.
OAuth.registerService("x", 2, null, async (query: { code: string }) => ({ serviceData: { code: query.code } }));
OAuth.registerService("google", 2, null, async (query) => {
  expectTypeOf(query).toEqualTypeOf<Record<string, string>>();
  return { serviceData: { code: query.code }, options: { profile: { name: "n" } } };
});
OAuth.registerService(
  "twitter",
  1,
  { requestToken: "r", authorize: "a", accessToken: "t" },
  async (oauthBinding: OAuth1Binding, request) => {
    expectTypeOf(request.query).toEqualTypeOf<Record<string, string>>();
    await oauthBinding.getAsync("https://example.test/verify");
    return { serviceData: { accessToken: oauthBinding.accessToken } };
  }
);
// A custom `_requestHandlers` entry decides the version and the handler arguments.
declare const customVersion: number | string;
OAuth.registerService("custom", customVersion, null, async (token: string) => ({ serviceData: { token } }));
// @ts-expect-error handlers must resolve to service data
OAuth.registerService("x", 2, null, async () => null);

expectTypeOf(OAuth._requestHandlers).toEqualTypeOf<Record<string, OAuthVersionRequestHandler>>();
OAuth._requestHandlers["3"] = async (service, query, res) => {
  expectTypeOf(service).toEqualTypeOf<OAuthRegisteredService>();
  expectTypeOf(service.version).toEqualTypeOf<number | string>();
  expectTypeOf(query).toEqualTypeOf<Record<string, string>>();
  expectTypeOf(res).toEqualTypeOf<http.ServerResponse>();
  const result = await service.handleOauthRequest(query);
  expectTypeOf(result).toEqualTypeOf<OAuthHandlerResult>();
};

// Both the in-memory cache and Web Storage participate in credential lookup.
// Web Storage returns null when the credential is absent.
expectTypeOf(OAuth._retrieveCredentialSecret).returns.toEqualTypeOf<
  string | null | undefined
>();

// Service configuration and the public login options historically accept a
// string. The helper validates it at runtime and returns the resolved literal.
OAuth._loginStyle("example", { loginStyle: "" }, { loginStyle: "popup" });
expectTypeOf(OAuth._loginStyle).returns.toEqualTypeOf<OAuthLoginStyle>();

// Applications can customize the pending-credential implementation (for
// example to keep a credential reusable while completing 2FA), so the
// internal storage contract must not assume credentials are always objects.
OAuth._storePendingCredential("token", "opaque-credential");
OAuth._retrievePendingCredential = async () => "opaque-credential";
expectTypeOf(OAuth._retrievePendingCredential).returns.toEqualTypeOf<Promise<unknown>>();

// The public accessor resolves the stored credential, the stored error, or
// nothing when the token is unknown.
expectTypeOf(OAuth.retrieveCredential).parameters.toEqualTypeOf<[string, (string | null)?]>();
expectTypeOf(OAuth.retrieveCredential).returns.resolves.toEqualTypeOf<
  OAuthCredential | Error | undefined
>();
declare const retrieved: Awaited<ReturnType<typeof OAuth.retrieveCredential>>;
if (retrieved instanceof Error) {
  expectTypeOf(retrieved).toEqualTypeOf<Error>();
} else if (retrieved) {
  expectTypeOf(retrieved.serviceName).toEqualTypeOf<string>();
  expectTypeOf(retrieved.serviceData).toEqualTypeOf<Record<string, unknown>>();
  expectTypeOf(retrieved.options).toEqualTypeOf<Record<string, unknown> | undefined>();
}
