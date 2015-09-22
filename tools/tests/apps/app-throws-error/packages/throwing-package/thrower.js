process.env.THROW_FROM_PACKAGE && Meteor.startup(function () {
  throw new Error("Should be line 2!");
});
