import { expectTypeOf } from "expect-type";
import { Twitter } from "./twitter-oauth";

expectTypeOf(Twitter).toBeObject();

expectTypeOf(Twitter.requestCredential).toBeFunction();
expectTypeOf(Twitter.requestCredential).returns.toBeVoid();
Twitter.requestCredential(() => {});
Twitter.requestCredential({ loginStyle: "popup" }, () => {});
Twitter.requestCredential(undefined, () => {});
declare const configuredLoginStyle: string;
Twitter.requestCredential({ loginStyle: configuredLoginStyle }, () => {});
Twitter.requestCredential({ requestPermissions: ["email"] as const }, () => {});
// @ts-expect-error callback-only and options-plus-callback are distinct call shapes
Twitter.requestCredential(() => {}, () => {});

expectTypeOf(Twitter.retrieveCredential).parameters.toEqualTypeOf<[string, (string | null)?]>();
expectTypeOf(Twitter.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();

expectTypeOf(Twitter.validParamsAuthenticate).toEqualTypeOf<string[]>();
expectTypeOf(Twitter.whitelistedFields).toEqualTypeOf<string[]>();
