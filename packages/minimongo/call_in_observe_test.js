// This file is a regression test for https://github.com/meteor/meteor/issues/907

Meteor.methods({
  isRunningOnServer: function () {
    return Meteor.isServer;
  },
  insertIntoLocalCollection: function () {
    if (Meteor.isClient) {
      LocalCollection.insert({});
    }
  }
});

if (Meteor.isClient) {
  var LocalCollection = new Meteor.Collection(null);

  testAsyncMulti("Meteor.call inside observe sends method to server", [
    function (test, expect) {
      var done = expect();

      LocalCollection.find().observe({
        added: function () {
          Meteor.call("isRunningOnServer", function (err, res) {
            test.equal(err, undefined);
            test.equal(res, true);
            done();
          });
        }
      });

      Meteor.call("insertIntoLocalCollection");
    }
  ]);
}
