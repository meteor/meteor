APICollection = new Meteor.Collection(null);

_.each(DocsData, function (val) {
  APICollection.insert(val);
});

Template.search.events({
  "keydown input": function (event) {
    Session.set("searchQuery", event.target.value);
  }
});

Template.search.helpers({
  searchResults: function () {
    return APICollection.find({longname: {$regex: Session.get("searchQuery")}});
  }
});