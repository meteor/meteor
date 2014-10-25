Template.registerHelper("fullApi", function () {
  return Session.get("fullApi");
});

Template.basicOrFullSelect.events({
  "change .basic-or-full": function (event) {
    Session.set("fullApi", event.target.value === "full");
    // XXX might not work in IE9?
    window.location.replace(Session.equals("fullApi", true) ? "#/full/" : "#/basic/");
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
