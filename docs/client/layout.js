release = Meteor.release ? "0.9.4" : "(checkout)";

Template.registerHelper("release", release);

Template.registerHelper("fullApi", function () {
  return Session.get("fullApi");
});

Template.basicOrFullSelect.events({
  "change .basic-or-full": function (event) {
    // XXX might not work in IE9?
    // Switch to the opposite docs type
    navigate("#/" + event.target.value + "/");
  }
});

Template.basicOrFullSelect.helpers({
  isBasic: function () {
    return ! Session.get("fullApi");
  },
  isFull: function () {
    return Session.get("fullApi");
  }
});

Template.sidebar.helpers({
  topLink: function () {
    var docsType = Session.get("fullApi") ? "full" : "basic";
    return "#/" + docsType + "/";
  }
});

