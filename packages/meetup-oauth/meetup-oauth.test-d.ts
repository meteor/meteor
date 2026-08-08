import { expectTypeOf } from "expect-type";
import { Meetup } from "./meetup-oauth";

expectTypeOf(Meetup).toBeObject();

expectTypeOf(Meetup.requestCredential).toBeFunction();
expectTypeOf(Meetup.requestCredential).returns.toBeVoid();

expectTypeOf(Meetup.retrieveCredential).parameters.toEqualTypeOf<[string, string?]>();
expectTypeOf(Meetup.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();
