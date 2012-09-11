Meteor.accounts.passwords = {};

// internal email validation tokens collection. Never published.
Meteor.accounts._emailValidationTokens = new Meteor.Collection(
  "accounts._emailValidationTokens",
  null /*manager*/,
  null /*driver*/,
  true /*preventAutopublish*/);