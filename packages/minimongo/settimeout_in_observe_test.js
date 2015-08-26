// This file is a regression test for https://github.com/meteor/meteor/issues/2691

Meteor.methods({
  isRunningOnServer2: function () {
    return Meteor.isServer;
  },
  insertIntoLocalCollection2: function () {
    if (Meteor.isClient) {
      LocalCollection.insert({});
    }
  }
});

if (Meteor.isClient) {
  var LocalCollection = new Meteor.Collection(null);

  testAsyncMulti("setTimeout inside observe works", [
    function (test, expect) {
      var done = expect();

      LocalCollection.find().observe({
        added: function () {
          Meteor.setTimeout(function () {
            Meteor.call("isRunningOnServer2", function (err, res) {
              test.isFalse(err);
              test.equal(res, true);
              done();
            });
          }, 0);
        }
      });

      Meteor.call("insertIntoLocalCollection2");
    }
  ]);
}
