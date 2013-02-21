Entries = new Meteor.Collection("entries");

Meteor.methods({
  addEntry: function (message) {
    Entries.insert({message: message, when: new Date});
  }
});
