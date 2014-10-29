APICollection = new Meteor.Collection(null);

_.each(DocsData, function (val) {
  APICollection.insert(val);
});

Template.search.events({
  "keyup input": function (event) {
    Session.set("searchQuery", event.target.value);
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
  searchQuery: function () {
    return Session.get("searchQuery");
  }
});
