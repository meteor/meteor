import { expectTypeOf } from "expect-type";
import { MeteorDeveloperAccounts } from "./meteor-developer-oauth";

expectTypeOf(MeteorDeveloperAccounts).toBeObject();

expectTypeOf(MeteorDeveloperAccounts.requestCredential).toBeFunction();
expectTypeOf(MeteorDeveloperAccounts.requestCredential).returns.toBeVoid();

expectTypeOf(MeteorDeveloperAccounts.retrieveCredential).parameters.toEqualTypeOf<
  [string, string?]
>();
expectTypeOf(MeteorDeveloperAccounts.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();
