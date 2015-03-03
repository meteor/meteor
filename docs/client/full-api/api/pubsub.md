{{#template name="apiPubsub"}}

<h2 id="publishandsubscribe"><span>Publish and subscribe</span></h2>

These functions control how Meteor servers publish sets of records and
how clients can subscribe to those sets.

{{> autoApiBox "Meteor.publish"}}

To publish records to clients, call `Meteor.publish` on the server with
two parameters: the name of the record set, and a *publish function*
that Meteor will call each time a client subscribes to the name.

Publish functions can return a
[`Collection.Cursor`](#mongo_cursor), in which case Meteor
will publish that cursor's documents to each subscribed client. You can
also return an array of `Collection.Cursor`s, in which case Meteor will
publish all of the cursors.

{{#warning}}
If you return multiple cursors in an array, they currently must all be from
different collections. We hope to lift this restriction in a future release.
{{/warning}}

    // server: publish the rooms collection, minus secret info.
    Meteor.publish("rooms", function () {
      return Rooms.find({}, {fields: {secretInfo: 0}});
    });

    // ... and publish secret info for rooms where the logged-in user
    // is an admin. If the client subscribes to both streams, the records
    // are merged together into the same documents in the Rooms collection.
    Meteor.publish("adminSecretInfo", function () {
      return Rooms.find({admin: this.userId}, {fields: {secretInfo: 1}});
    });

    // publish dependent documents and simulate joins
    Meteor.publish("roomAndMessages", function (roomId) {
      check(roomId, String);
      return [
        Rooms.find({_id: roomId}, {fields: {secretInfo: 0}}),
        Messages.find({roomId: roomId})
      ];
    });

Alternatively, a publish function can directly control its published record set
by calling the functions [`added`](#publish_added) (to add a new document to the
published record set), [`changed`](#publish_changed) (to change or clear some
fields on a document already in the published record set), and
[`removed`](#publish_removed) (to remove documents from the published record
set).  These methods are provided by `this` in your publish function.

If a publish function does not return a cursor or array of cursors, it is
assumed to be using the low-level `added`/`changed`/`removed` interface, and it
**must also call [`ready`](#publish_ready) once the initial record set is
complete**.

Example:

    // server: publish the current size of a collection
    Meteor.publish("counts-by-room", function (roomId) {
      var self = this;
      check(roomId, String);
      var count = 0;
      var initializing = true;

      // observeChanges only returns after the initial `added` callbacks
      // have run. Until then, we don't want to send a lot of
      // `self.changed()` messages - hence tracking the
      // `initializing` state.
      var handle = Messages.find({roomId: roomId}).observeChanges({
        added: function (id) {
          count++;
          if (!initializing)
            self.changed("counts", roomId, {count: count});
        },
        removed: function (id) {
          count--;
          self.changed("counts", roomId, {count: count});
        }
        // don't care about changed
      });

      // Instead, we'll send one `self.added()` message right after
      // observeChanges has returned, and mark the subscription as
      // ready.
      initializing = false;
      self.added("counts", roomId, {count: count});
      self.ready();

      // Stop observing the cursor when client unsubs.
      // Stopping a subscription automatically takes
      // care of sending the client any removed messages.
      self.onStop(function () {
        handle.stop();
      });
    });

    // client: declare collection to hold count object
    Counts = new Mongo.Collection("counts");

    // client: subscribe to the count for the current room
    Tracker.autorun(function () {
      Meteor.subscribe("counts-by-room", Session.get("roomId"));
    });

    // client: use the new collection
    console.log("Current room has " +
                Counts.findOne(Session.get("roomId")).count +
                " messages.");

    // server: sometimes publish a query, sometimes publish nothing
    Meteor.publish("secretData", function () {
      if (this.userId === 'superuser') {
        return SecretData.find();
      } else {
        // Declare that no data is being published. If you leave this line
        // out, Meteor will never consider the subscription ready because
        // it thinks you're using the added/changed/removed interface where
        // you have to explicitly call this.ready().
        return [];
      }
    });

Since publish functions usually expect particular types as arguments,
use [`check`](#check) liberally to ensure the arguments have
the correct [types and structure](#matchpatterns).

{{#warning}}
Meteor will emit a warning message if you call `Meteor.publish` in a
project that includes the `autopublish` package.  Your publish function
will still work.
{{/warning}}

{{> autoApiBox "Subscription#userId"}}

This is constant. However, if the logged-in user changes, the publish
function is rerun with the new value.

{{> autoApiBox "Subscription#added"}}
{{> autoApiBox "Subscription#changed"}}
{{> autoApiBox "Subscription#removed"}}
{{> autoApiBox "Subscription#ready"}}
{{> autoApiBox "Subscription#onStop"}}

If you call [`observe`](#observe) or [`observeChanges`](#observe_changes) in your
publish handler, this is the place to stop the observes.

{{> autoApiBox "Subscription#error"}}
{{> autoApiBox "Subscription#stop"}}
{{> autoApiBox "Subscription#connection"}}

{{> autoApiBox "Meteor.subscribe"}}

When you subscribe to a record set, it tells the server to send records to the
client.  The client stores these records in local [Minimongo
collections](#mongo_collection), with the same name as the `collection`
argument used in the publish handler's [`added`](#publish_added),
[`changed`](#publish_changed), and [`removed`](#publish_removed)
callbacks.  Meteor will queue incoming records until you declare the
[`Mongo.Collection`](#mongo_collection) on the client with the matching
collection name.

    // okay to subscribe (and possibly receive data) before declaring
    // the client collection that will hold it.  assume "allplayers"
    // publishes data from server's "players" collection.
    Meteor.subscribe("allplayers");
    ...
    // client queues incoming players records until ...
    ...
    Players = new Mongo.Collection("players");

The client will see a document if the document is currently in the published
record set of any of its subscriptions.

The `onReady` callback is called with no arguments when the server [marks the
subscription as ready](#publish_ready). The `onStop` callback is called with
a [`Meteor.Error`](#meteor_error) if the subscription fails or is terminated by
the server. If the subscription is stopped by calling `stop` on the subscription
handle or inside the publication, `onStop` is called with no arguments.

`Meteor.subscribe` returns a subscription handle, which is an object with the
following properties:

<dl class="callbacks">
{{#dtdd "stop()"}}
Cancel the subscription. This will typically result in the server directing the
client to remove the subscription's data from the client's cache.
{{/dtdd}}

{{#dtdd "ready()"}}
True if the server has [marked the subscription as ready](#publish_ready). A
reactive data source.
{{/dtdd}}

{{#dtdd "subscriptionId"}}
The `id` of the subscription this handle is for. When you run `Meteor.subscribe`
inside of `Tracker.autorun`, the handles you get will always have the same
`subscriptionId` field. You can use this to deduplicate subscription handles
if you are storing them in some data structure.
{{/dtdd}}
</dl>

If you call `Meteor.subscribe` within a [reactive computation](#reactivity),
for example using
[`Tracker.autorun`](#tracker_autorun), the subscription will automatically be
cancelled when the computation is invalidated or stopped; it's not necessary
to call `stop` on
subscriptions made from inside `autorun`. However, if the next iteration
of your run function subscribes to the same record set (same name and
parameters), Meteor is smart enough to skip a wasteful
unsubscribe/resubscribe. For example:

    Tracker.autorun(function () {
      Meteor.subscribe("chat", {room: Session.get("current-room")});
      Meteor.subscribe("privateMessages");
    });

This subscribes you to the chat messages in the current room and to your private
messages. When you change rooms by calling `Session.set("current-room",
"new-room")`, Meteor will subscribe to the new room's chat messages,
unsubscribe from the original room's chat messages, and continue to
stay subscribed to your private messages.

If more than one subscription sends conflicting values for a field (same
collection name, document ID, and field name), then the value on the client will
be one of the published values, chosen arbitrarily.

{{/template}}