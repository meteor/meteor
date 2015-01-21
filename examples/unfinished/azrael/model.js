// XXX it is actually very dangerous to store times as Number. use
// Date type once it's implemented in minimongo
Rooms = new Mongo.Collection("rooms");
//Rooms.schema({name: String, created: Number});

Chat = new Mongo.Collection("chat");
/*
Chat.schema({room: String, message: String,
             username: String, created: Number});
*/

if (Meteor.isServer) {
  Meteor.publish('rooms', function () {
    return Rooms.find();
  });

  // XXX should limit to just a certain amount of recent chat ..
  Meteor.publish('room-detail', function (room) {
    return Chat.find({room: room});
  });
}
