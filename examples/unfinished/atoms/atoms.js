if (Meteor.isClient) {
  Template.atom.textY = function () {
    return this.y + 8;
  };
}
