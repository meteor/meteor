import { expectTypeOf } from "expect-type";
import { Github } from "./github-oauth";

expectTypeOf(Github).toBeObject();

expectTypeOf(Github.requestCredential).toBeFunction();
expectTypeOf(Github.requestCredential).returns.toBeVoid();
Github.requestCredential(() => {});
Github.requestCredential({ loginStyle: "popup" }, () => {});
Github.requestCredential(undefined, () => {});
declare const configuredLoginStyle: string;
Github.requestCredential({ loginStyle: configuredLoginStyle }, () => {});
Github.requestCredential({ requestPermissions: ["email"] as const }, () => {});
// @ts-expect-error callback-only and options-plus-callback are distinct call shapes
Github.requestCredential(() => {}, () => {});

expectTypeOf(Github.retrieveCredential).parameters.toEqualTypeOf<[string, (string | null)?]>();
expectTypeOf(Github.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();
