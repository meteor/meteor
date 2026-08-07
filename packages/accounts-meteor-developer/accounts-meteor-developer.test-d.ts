import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";

// accounts-meteor-developer's only surface is augmenting Meteor with the loginWithMeteorDeveloperAccount login helper.
expectTypeOf(Meteor.loginWithMeteorDeveloperAccount).toBeFunction();
expectTypeOf(Meteor.loginWithMeteorDeveloperAccount).returns.toBeVoid();
expectTypeOf(Meteor.loginWithMeteorDeveloperAccount).parameter(0).toEqualTypeOf<
  Parameters<typeof Meteor.loginWithMeteorDeveloperAccount>[0]
>();
