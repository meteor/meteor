import { expectTypeOf } from "expect-type";
import { Twitter } from "./twitter-oauth";

expectTypeOf(Twitter).toBeObject();

expectTypeOf(Twitter.requestCredential).toBeFunction();
expectTypeOf(Twitter.requestCredential).returns.toBeVoid();

expectTypeOf(Twitter.retrieveCredential).parameters.toEqualTypeOf<[string, string?]>();
expectTypeOf(Twitter.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();

expectTypeOf(Twitter.validParamsAuthenticate).toEqualTypeOf<string[]>();
expectTypeOf(Twitter.whitelistedFields).toEqualTypeOf<string[]>();
