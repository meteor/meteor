import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";

// accounts-facebook's only surface is augmenting Meteor with the loginWithFacebook login helper.
expectTypeOf(Meteor.loginWithFacebook).toBeFunction();
expectTypeOf(Meteor.loginWithFacebook).returns.toBeVoid();
expectTypeOf(Meteor.loginWithFacebook).parameter(0).toEqualTypeOf<
  Parameters<typeof Meteor.loginWithFacebook>[0]
>();
