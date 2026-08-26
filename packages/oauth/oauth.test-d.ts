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
