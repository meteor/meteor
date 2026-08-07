import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";

// accounts-meetup's only surface is augmenting Meteor with the loginWithMeetup login helper.
expectTypeOf(Meteor.loginWithMeetup).toBeFunction();
expectTypeOf(Meteor.loginWithMeetup).returns.toBeVoid();
expectTypeOf(Meteor.loginWithMeetup).parameter(0).toEqualTypeOf<
  Parameters<typeof Meteor.loginWithMeetup>[0]
>();
