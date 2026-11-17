import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";

// accounts-meetup's only surface is augmenting Meteor with the loginWithMeetup login helper.
expectTypeOf(Meteor.loginWithMeetup).toBeFunction();
expectTypeOf(Meteor.loginWithMeetup).returns.toBeVoid();
// both call shapes are accepted: (callback) and (options, callback)
expectTypeOf(Meteor.loginWithMeetup).toBeCallableWith(() => {});
Meteor.loginWithMeetup((error) => {
  expectTypeOf(error).toEqualTypeOf<
    globalThis.Error | Meteor.Error | Meteor.TypedError | undefined
  >();
});
