// XXX it is actually very dangerous to store times as Number. use
// Date type once it's implemented in minimongo
Rooms = Sky.Collection("rooms");
Rooms.schema({name: String, created: Number});

Chat = Sky.Collection("chat");
Chat.schema({room: String, message: String,
             username: String, created: Number});

Sky.publish('rooms');

// XXX should limit to just a certain amount of recent chat ..
Sky.publish('room-detail', {
  collection: Chat,
  selector: function (params) {
    return {room: params.room};
  }
});
