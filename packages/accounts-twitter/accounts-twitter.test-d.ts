import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";

// accounts-twitter's only surface is augmenting Meteor with the loginWithTwitter login helper.
expectTypeOf(Meteor.loginWithTwitter).toBeFunction();
expectTypeOf(Meteor.loginWithTwitter).returns.toBeVoid();
expectTypeOf(Meteor.loginWithTwitter).parameter(0).toEqualTypeOf<
  Parameters<typeof Meteor.loginWithTwitter>[0]
>();
