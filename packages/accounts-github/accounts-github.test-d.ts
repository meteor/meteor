import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";

// accounts-github's only surface is augmenting Meteor with the loginWithGithub login helper.
expectTypeOf(Meteor.loginWithGithub).toBeFunction();
expectTypeOf(Meteor.loginWithGithub).returns.toBeVoid();
// both call shapes are accepted: (callback) and (options, callback)
expectTypeOf(Meteor.loginWithGithub).toBeCallableWith(() => {});
Meteor.loginWithGithub((error) => {
  expectTypeOf(error).toEqualTypeOf<
    globalThis.Error | Meteor.Error | Meteor.TypedError | undefined
  >();
});
