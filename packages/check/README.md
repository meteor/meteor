# check

`check` is a lightweight package for argument checking and general pattern matching. Use it like this:

```
Meteor.publish("chats-in-room", function (roomId) {
  // Make sure roomId is a string, not an arbitrary mongo selector object.
  check(roomId, String);
  return Chats.find({room: roomId});
});

Meteor.methods({addChat: function (roomId, message) {
  check(roomId, String);
  check(message, {
    text: String,
    timestamp: Date,
    // Optional, but if present must be an array of strings.
    tags: Match.Optional([String])
  });

  // ... do something with the message ...
}});
```

For more details see the [`check` section](http://docs.meteor.com/#check_package) of the Meteor docs.