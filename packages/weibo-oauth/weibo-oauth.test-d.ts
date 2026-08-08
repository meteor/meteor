import { expectTypeOf } from "expect-type";
import { Weibo } from "./weibo-oauth";

expectTypeOf(Weibo).toBeObject();

expectTypeOf(Weibo.requestCredential).toBeFunction();
expectTypeOf(Weibo.requestCredential).returns.toBeVoid();

expectTypeOf(Weibo.retrieveCredential).parameters.toEqualTypeOf<[string, string?]>();
expectTypeOf(Weibo.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();
