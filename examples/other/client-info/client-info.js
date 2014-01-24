if (Meteor.isServer) {
  Meteor.publish("clientInfo", function () {
    var self = this;
    self.added("clientInfo", "info", self.connection.client);
    self.ready();
  });
}

if (Meteor.isClient) {
  Meteor.subscribe("clientInfo");
  var ClientInfo = new Meteor.Collection("clientInfo");

  Template.info.info = function () {
    return EJSON.stringify(ClientInfo.findOne("info"), {indent: true});
  };
}
