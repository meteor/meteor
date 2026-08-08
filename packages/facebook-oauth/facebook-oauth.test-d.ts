import { expectTypeOf } from "expect-type";
import { Facebook } from "./facebook-oauth";

expectTypeOf(Facebook).toBeObject();

expectTypeOf(Facebook.requestCredential).toBeFunction();
expectTypeOf(Facebook.requestCredential).returns.toBeVoid();

expectTypeOf(Facebook.retrieveCredential).parameters.toEqualTypeOf<[string, string?]>();
expectTypeOf(Facebook.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();

expectTypeOf(Facebook.handleAuthFromAccessToken).parameters.toEqualTypeOf<[string, number]>();
expectTypeOf(Facebook.handleAuthFromAccessToken).returns.toEqualTypeOf<
  Promise<Record<string, unknown>>
>();
