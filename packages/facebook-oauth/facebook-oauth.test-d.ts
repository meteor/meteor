import { expectTypeOf } from "expect-type";
import { Facebook } from "./facebook-oauth";

expectTypeOf(Facebook).toBeObject();

expectTypeOf(Facebook.requestCredential).toBeFunction();
expectTypeOf(Facebook.requestCredential).returns.toBeVoid();
Facebook.requestCredential(() => {});
Facebook.requestCredential({ loginStyle: "popup" }, () => {});
Facebook.requestCredential(undefined, () => {});
declare const configuredLoginStyle: string;
Facebook.requestCredential({ loginStyle: configuredLoginStyle }, () => {});
Facebook.requestCredential({ requestPermissions: ["email"] as const }, () => {});
// @ts-expect-error callback-only and options-plus-callback are distinct call shapes
Facebook.requestCredential(() => {}, () => {});

expectTypeOf(Facebook.retrieveCredential).parameters.toEqualTypeOf<[string, (string | null)?]>();
expectTypeOf(Facebook.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();

expectTypeOf(Facebook.handleAuthFromAccessToken).parameters.toEqualTypeOf<[string, number]>();
expectTypeOf(Facebook.handleAuthFromAccessToken).returns.toEqualTypeOf<
  Promise<Record<string, unknown>>
>();
