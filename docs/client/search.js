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
      return APICollection.find({longname: {$regex: Session.get("searchQuery"), $options: 'i'}});
    }
  },
  searchQuery: function () {
    return Session.get("searchQuery");
  }
});
