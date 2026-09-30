import { expectTypeOf } from "expect-type";
import { Meetup } from "./meetup-oauth";

expectTypeOf(Meetup).toBeObject();

expectTypeOf(Meetup.requestCredential).toBeFunction();
expectTypeOf(Meetup.requestCredential).returns.toBeVoid();
Meetup.requestCredential(() => {});
Meetup.requestCredential({ loginStyle: "popup" }, () => {});
Meetup.requestCredential(undefined, () => {});
declare const configuredLoginStyle: string;
Meetup.requestCredential({ loginStyle: configuredLoginStyle }, () => {});
Meetup.requestCredential({ requestPermissions: ["email"] as const }, () => {});
// @ts-expect-error callback-only and options-plus-callback are distinct call shapes
Meetup.requestCredential(() => {}, () => {});

expectTypeOf(Meetup.retrieveCredential).parameters.toEqualTypeOf<[string, (string | null)?]>();
expectTypeOf(Meetup.retrieveCredential).returns.toMatchTypeOf<Promise<unknown>>();
