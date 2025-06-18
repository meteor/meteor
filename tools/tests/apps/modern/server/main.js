import { Meteor } from "meteor/meteor";

Meteor.startup(() => {});

try {
  const errorStack = new Error().stack;
  console.log(errorStack);
} catch (e) {
  console.log(e);
}
