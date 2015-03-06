{{#template name="basicPubsub"}}

<h2 id="pubsub"><span>Publish and subscribe</span></h2>

Meteor servers can publish sets of documents with `Meteor.publish`, and
clients can subscribe to those publications with `Meteor.subscribe`. Any
documents the client subscribes to will be available through the `find`
method of client collections.

By default, every newly created Meteor app contains the `autopublish`
package, which automatically publishes all available documents to every
client. To exercise finer-grained control over what documents different
clients receive, first remove `autopublish`:

```
$ meteor remove autopublish
```

Now you can use `Meteor.publish` and `Meteor.subscribe` to control what
documents flow from the server to its clients.

{{> autoApiBox "Meteor.publish"}}

To publish data to clients, call `Meteor.publish` on the server with two
arguments: the name of the record set, and a *publish function* that will
be called each time a client subscribes to this record set.

Publish functions typically return the result of calling
`collection.find(query)` on some `collection` with a `query` that narrows
down the set of documents to publish from that collection:

```
// Publish the logged in user's posts
Meteor.publish("posts", function () {
  return Posts.find({ createdBy: this.userId });
});
```

You can publish documents from multiple collections by returning an array
of `collection.find` results:

```
// Publish a single post and its comments
Meteor.publish("postAndComments", function (postId) {
  // Check argument
  check(postId, String);

  return [
    Posts.find({ _id: postId }),
    Comments.find({ postId: roomId })
  ];
});
```

Inside the publish function, `this.userId` is the current logged-in user's
`_id`, which can be useful for filtering collections so that certain
documents are visible only to certain users. If the logged-in user changes
for a particular client, the publish function will be automatically rerun
with the new `userId`, so the new user will not have access to any
documents that were meant only for the previous user.

{{> autoApiBox "Meteor.subscribe"}}

Clients call `Meteor.subscribe` to express interest in document
collections published by the server. Clients can further filter these
collections of documents by calling [`collection.find(query)`](#find).
Whenever any data that was accessed by a publish function changes on the
server, the publish function is automatically rerun and the updated
document collections are pushed to the subscribed client.

The `onReady` callback is called with no arguments when the server has sent all
of the initial data for the subscription. The `onStop` callback is when the
subscription is terminated for any reason; it receives a
[`Meteor.Error`](#meteor_error) if the subscription failed due to a server-side
error.

`Meteor.subscribe` returns a subscription handle, which is an object with the
following methods:

<dl class="callbacks">
{{#dtdd "stop()"}}
Cancel the subscription. This will typically result in the server directing the
client to remove the subscription's data from the client's cache.
{{/dtdd}}

{{#dtdd "ready()"}}
Returns true if the server has [marked the subscription as
ready](#publish_ready). A reactive data source.
{{/dtdd}}
</dl>

If you call `Meteor.subscribe` inside
[`Tracker.autorun`](#tracker_autorun), the subscription will be cancelled
automatically whenever the computation reruns (so that a new subscription
can be created, if appropriate), meaning you don't have to to call `stop`
on subscriptions made from inside `Tracker.autorun`.

{{/template}}
