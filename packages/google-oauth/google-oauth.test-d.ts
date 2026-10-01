import { expectTypeOf } from "expect-type";
import type { Meteor } from "meteor/meteor";
import { Google } from "./google-oauth";

expectTypeOf(Google).toBeObject();

expectTypeOf(Google.requestCredential).toBeFunction();
expectTypeOf(Google.requestCredential).returns.toBeVoid();
Google.requestCredential(() => {});
Google.requestCredential({ loginStyle: "popup" }, () => {});
Google.requestCredential(undefined, () => {});
declare const configuredLoginStyle: string;
Google.requestCredential({ loginStyle: configuredLoginStyle }, () => {});
declare const readonlyPermissions: readonly string[];
Google.requestCredential({ requestPermissions: readonlyPermissions }, () => {});
declare const meteorLoginOptions: Meteor.LoginWithExternalServiceOptions;
Google.requestCredential(meteorLoginOptions, () => {});
// @ts-expect-error callback-only and options-plus-callback are distinct call shapes
Google.requestCredential(() => {}, () => {});

expectTypeOf(Google.retrieveCredential).parameters.toEqualTypeOf<[string, (string | null)?]>();
expectTypeOf(Google.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();

expectTypeOf(Google.signIn).toBeFunction();
Google.signIn((error) => {
  expectTypeOf(error).toEqualTypeOf<
    globalThis.Error | Meteor.Error | Meteor.TypedError | undefined
  >();
});
declare const optionalLoginOptions: Meteor.LoginWithExternalServiceOptions | undefined;
declare const optionalLoginCallback:
  | ((error?: globalThis.Error | Meteor.Error | Meteor.TypedError) => void)
  | undefined;
Google.signIn(optionalLoginOptions, optionalLoginCallback);
expectTypeOf(Google.signOut).returns.toEqualTypeOf<Promise<void>>();

expectTypeOf(Google.whitelistedFields).toEqualTypeOf<string[]>();
