import { expectTypeOf } from "expect-type";
import { Google } from "./google-oauth";

expectTypeOf(Google).toBeObject();

expectTypeOf(Google.requestCredential).toBeFunction();
expectTypeOf(Google.requestCredential).returns.toBeVoid();
Google.requestCredential(() => {});
Google.requestCredential({ loginStyle: "popup" }, () => {});
Google.requestCredential(undefined, () => {});
// @ts-expect-error callback-only and options-plus-callback are distinct call shapes
Google.requestCredential(() => {}, () => {});

expectTypeOf(Google.retrieveCredential).parameters.toEqualTypeOf<[string, (string | null)?]>();
expectTypeOf(Google.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();

expectTypeOf(Google.signIn).toBeFunction();
expectTypeOf(Google.signOut).returns.toEqualTypeOf<Promise<void>>();

expectTypeOf(Google.whitelistedFields).toEqualTypeOf<string[]>();
