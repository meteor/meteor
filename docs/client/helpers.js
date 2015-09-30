release = Meteor.release ? "1.2.0.1" : "(checkout)";

Template.registerHelper("release", release);

Template.registerHelper("fullApi", function () {
  return Session.get("fullApi");
});

Template.registerHelper('dstache', function() {
  return '{{';
});

Template.registerHelper('tstache', function() {
  return '{{{';
});

Template.registerHelper('lt', function () {
  return '<';
});
