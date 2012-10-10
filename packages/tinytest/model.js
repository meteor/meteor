Meteor._ServerTestResults = new Meteor.Collection('tinytest_results');
Meteor._ServerTestResults.allow({
  insert: function() { return true; },
  update: function() { return true; },
  remove: function() { return true; }
});
