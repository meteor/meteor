import { expectTypeOf } from "expect-type";
import { Github } from "./github-oauth";

expectTypeOf(Github).toBeObject();

expectTypeOf(Github.requestCredential).toBeFunction();
expectTypeOf(Github.requestCredential).returns.toBeVoid();

expectTypeOf(Github.retrieveCredential).parameters.toEqualTypeOf<[string, string?]>();
expectTypeOf(Github.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();
