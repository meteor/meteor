APICollection = new Meteor.Collection(null);

_.each(DocsData, function (val) {
  APICollection.insert(val);
});

Session.setDefault("searchOpen", false);
Session.set("searchQuery", "");

$(document).on("keydown", function (event) {
  if (event.which === 27) {
    Session.set("searchOpen", false);
  } else {
    if (! Session.get("searchOpen")) {
      Session.set("searchOpen", true);

      Tracker.flush();
      $(".search-query").val("");
      $(".search-query").focus();
    }
  }
});

var updateQuery = _.debounce(function () {
  Session.set("searchQuery", $(".search-query").val());
}, 100);

Template.search.events({
  "keyup input": updateQuery,
  "click .close-search": function () {
    Session.set("searchOpen", false);
  }
});

Template.search.helpers({
  searchResults: function () {
    if (Session.get("searchQuery")) {
      var regex = new RegExp(Session.get("searchQuery"), "i");

      return APICollection.find({$or: [
        { longname: {$regex: regex}},
        { summary: {$regex: regex}}
      ]});
    }
  },
  searchOpen: function () {
    return Session.get("searchOpen");
  }
});
