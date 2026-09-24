import { expectTypeOf } from "expect-type";
import { MeteorDeveloperAccounts } from "./meteor-developer-oauth";

expectTypeOf(MeteorDeveloperAccounts).toBeObject();
expectTypeOf(MeteorDeveloperAccounts._server).toBeString();
expectTypeOf(MeteorDeveloperAccounts._config).parameter(0).toEqualTypeOf<{
  developerAccountsServer?: string;
}>();

expectTypeOf(MeteorDeveloperAccounts.requestCredential).toBeFunction();
expectTypeOf(MeteorDeveloperAccounts.requestCredential).returns.toBeVoid();
MeteorDeveloperAccounts.requestCredential(() => {});
MeteorDeveloperAccounts.requestCredential({ loginStyle: "popup" }, () => {});
MeteorDeveloperAccounts.requestCredential(undefined, () => {});
declare const configuredLoginStyle: string;
MeteorDeveloperAccounts.requestCredential({ loginStyle: configuredLoginStyle }, () => {});
MeteorDeveloperAccounts.requestCredential({ requestPermissions: ["email"] as const }, () => {});
// @ts-expect-error callback-only and options-plus-callback are distinct call shapes
MeteorDeveloperAccounts.requestCredential(() => {}, () => {});

expectTypeOf(MeteorDeveloperAccounts.retrieveCredential).parameters.toEqualTypeOf<
  [string, (string | null)?]
>();
expectTypeOf(MeteorDeveloperAccounts.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();
