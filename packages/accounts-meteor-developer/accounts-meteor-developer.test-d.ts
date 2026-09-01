import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";

// accounts-meteor-developer's only surface is augmenting Meteor with the loginWithMeteorDeveloperAccount login helper.
expectTypeOf(Meteor.loginWithMeteorDeveloperAccount).toBeFunction();
expectTypeOf(Meteor.loginWithMeteorDeveloperAccount).returns.toBeVoid();
// both call shapes are accepted: (callback) and (options, callback)
expectTypeOf(Meteor.loginWithMeteorDeveloperAccount).toBeCallableWith(() => {});
Meteor.loginWithMeteorDeveloperAccount((error) => {
  expectTypeOf(error).toEqualTypeOf<
    globalThis.Error | Meteor.Error | Meteor.TypedError | undefined
  >();
});
