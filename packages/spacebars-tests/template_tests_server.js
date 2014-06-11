var path = Npm.require("path");

Meteor.methods({
  getAsset: function (filename) {
    return Assets.getText(path.join("assets", filename));
  }
});
