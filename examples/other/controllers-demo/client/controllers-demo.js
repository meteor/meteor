MyForm = Meteor.Form.extend({
  onSave: function () {
    Meteor.call('addEntry', this.get("bob"));
    this.set("bob", "");
  }
});

Template.body.entries = function () {
  return Entries.find({}, {sort: {when: -1}, limit: 5})
};