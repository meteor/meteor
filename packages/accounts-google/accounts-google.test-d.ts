import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";

// accounts-google's only surface is augmenting Meteor with the loginWithGoogle login helper.
expectTypeOf(Meteor.loginWithGoogle).toBeFunction();
expectTypeOf(Meteor.loginWithGoogle).returns.toBeVoid();
expectTypeOf(Meteor.loginWithGoogle).parameter(0).toEqualTypeOf<
  Parameters<typeof Meteor.loginWithGoogle>[0]
>();
