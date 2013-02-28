MyForm = Meteor.Form.extend({
  onSave: function () {
    Meteor.call('addEntry', this.get("entry"));
    this.set("entry", "");
  },
  charsLeft: function () {
    return 140 - (this.get("entry") || '').length;
  }
});

ContinuouslySavingTextArea = TextBox.extend({
  savePolicy: "continuous",
  template: Template.ContinuouslySavingTextAreaView
});

Template.body.entries = function () {
  return Entries.find({}, {sort: {when: -1}, limit: 5})
};