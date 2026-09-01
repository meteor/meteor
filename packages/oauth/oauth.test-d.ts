import { expectTypeOf } from "expect-type";
import { OAuth, OAuthTest } from "./oauth";
import type {
  OAuthLoginStyle,
  OAuthStateParam,
  OAuthPopupDimensions,
  OAuthLaunchLoginOptions,
  OAuthDataAfterRedirect,
  OAuthServiceUrls,
  OAuthRequestData,
  OAuthRequestHandler,
  OAuthPendingCredentialDocument,
} from "./oauth";

expectTypeOf<OAuthLoginStyle>().toEqualTypeOf<"popup" | "redirect">();
expectTypeOf<OAuthStateParam>().toBeObject();
expectTypeOf<OAuthPopupDimensions>().toBeObject();
expectTypeOf<OAuthLaunchLoginOptions>().toBeObject();
expectTypeOf<OAuthDataAfterRedirect>().toBeObject();
expectTypeOf<OAuthServiceUrls>().toBeObject();
expectTypeOf<OAuthRequestData>().toBeObject();
expectTypeOf<OAuthRequestHandler>().toBeFunction();
expectTypeOf<OAuthPendingCredentialDocument>().toBeObject();

expectTypeOf(OAuth).toBeObject();
expectTypeOf(OAuthTest).toBeObject();

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
expectTypeOf(OAuth.retrieveCredential("token")).toEqualTypeOf<
  Promise<unknown | Error | undefined>
>();
