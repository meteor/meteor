import { expectTypeOf } from "expect-type";
import { Google } from "./google-oauth";

expectTypeOf(Google).toBeObject();

expectTypeOf(Google.requestCredential).toBeFunction();
expectTypeOf(Google.requestCredential).returns.toBeVoid();

expectTypeOf(Google.retrieveCredential).parameters.toEqualTypeOf<[string, (string | null)?]>();
expectTypeOf(Google.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();

expectTypeOf(Google.signIn).toBeFunction();
expectTypeOf(Google.signOut).returns.toEqualTypeOf<Promise<void>>();

expectTypeOf(Google.whitelistedFields).toEqualTypeOf<string[]>();
