import { expectTypeOf } from "expect-type";
import { Weibo } from "./weibo-oauth";

expectTypeOf(Weibo).toBeObject();

expectTypeOf(Weibo.requestCredential).toBeFunction();
expectTypeOf(Weibo.requestCredential).returns.toBeVoid();
Weibo.requestCredential(() => {});
Weibo.requestCredential({ loginStyle: "popup" }, () => {});
Weibo.requestCredential(undefined, () => {});
declare const configuredLoginStyle: string;
Weibo.requestCredential({ loginStyle: configuredLoginStyle }, () => {});
Weibo.requestCredential({ requestPermissions: ["email"] as const }, () => {});
// @ts-expect-error callback-only and options-plus-callback are distinct call shapes
Weibo.requestCredential(() => {}, () => {});

expectTypeOf(Weibo.retrieveCredential).parameters.toEqualTypeOf<[string, (string | null)?]>();
expectTypeOf(Weibo.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();
