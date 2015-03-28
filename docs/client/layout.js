Template.registerHelper("layoutHidden", function (type) {
  return (!!Session.get('fullApi')) ^ (type === 'full') ? 'hidden' : '';
});

Template.basicOrFullSelect.events({
  "change .basic-or-full": function (event) {
    // XXX might not work in IE9?
    window.location.hash = "#/" + event.target.value + "/";
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
