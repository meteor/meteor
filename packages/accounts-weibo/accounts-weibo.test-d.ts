import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";

// accounts-weibo's only surface is augmenting Meteor with the loginWithWeibo login helper.
expectTypeOf(Meteor.loginWithWeibo).toBeFunction();
expectTypeOf(Meteor.loginWithWeibo).returns.toBeVoid();
// both call shapes are accepted: (callback) and (options, callback)
expectTypeOf(Meteor.loginWithWeibo).toBeCallableWith(() => {});
Meteor.loginWithWeibo((error) => {
  expectTypeOf(error).toEqualTypeOf<
    globalThis.Error | Meteor.Error | Meteor.TypedError | undefined
  >();
});
