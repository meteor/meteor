var path = Npm.require("path");
var Future = Npm.require('fibers/future');

Meteor.methods({
  getAsset: function (filename) {
    return Assets.getText(path.join("assets", filename));
  }
});

var templateSubFutures = {};
Meteor.publish("templateSub", function (futureId) {
  var self = this;
  Meteor.defer(function () {  // because subs are blocking
    if (futureId) {
      var f = new Future();
      templateSubFutures[futureId] = f;
      f.wait();
      delete templateSubFutures[futureId];
    }

    self.ready();
  });
});
Meteor.methods({
  makeTemplateSubReady: function (futureId) {
    templateSubFutures[futureId].return();
  }
});
