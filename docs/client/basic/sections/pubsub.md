{{#template name="basicPubsub"}}

<h2 id="pubsub"><span>Publish and subscribe</span></h2>

Meteor servers can publish sets of documents with `Meteor.publish` and clients
can subscribe to those publications with `Meteor.subscribe`. Any data the
client subscribes to will be available through `find` on client collections.

Every newly created Meteor app contains the `autopublish` function, which
automatically publishes all of the data available on the server. To get more
fine-grained control over what the client gets, remove `autopublish`:

```
$ meteor remove autopublish
```

Then, you can use `Meteor.publish` and `Meteor.subscribe` to control what
data flows from the server to the client.

{{> autoApiBox "Meteor.publish"}}

To publish data to clients, call `Meteor.publish` on the server with
two parameters: the name of the record set, and a *publish function*
that Meteor will call each time a client subscribes to this name.

Publish functions can return the result of `collection.find`, in which case
Meteor will publish that query's documents to each subscribed client. You can
also return an array of queries, in which case Meteor will publish all of the
relevant documents.

Inside a publish function, `this.userId` is the current user's _id. When the
logged in user changes, the publish function will automatically rerun with
the new userId. This feature can be used for security and access control -
use `this.userId` to make sure that users never get documents they shouldn't
be seeing, like another user's private messages.

```
// On the server

// Publish the logged in user's posts
Meteor.publish("posts", function () {
  return Posts.find({ createdBy: this.userId });
});

// Publish a post and its comments
Meteor.publish("postAndComments", function (postId) {
  // Check argument
  check(postId, String);

  return [
    Posts.find({ _id: postId }),
    Comments.find({ postId: roomId })
  ];
});
```

{{> autoApiBox "Meteor.subscribe"}}

The client asks the server for data by using Meteor.subscribe. You can
access any data you have subscribed to by using [`collection.find`](#find) on
the client. Whenever data contained in a subsription is changed on the server,
the changes are automatically pushed to the client.

The `onReady` callback is called with no arguments when the server has sent all
of the initial data for the subsription. The `onError` callback is called with a
[`Meteor.Error`](#meteor_error) if the subscription fails or is terminated by
the server.

`Meteor.subscribe` returns a subscription handle, which is an object with the
following methods:

<dl class="callbacks">
{{#dtdd "stop()"}}
Cancel the subscription. This will typically result in the server directing the
client to remove the subscription's data from the client's cache.
{{/dtdd}}

{{#dtdd "ready()"}}
True if the server has [marked the subscription as ready](#publish_ready). A
reactive data source.
{{/dtdd}}
</dl>

If you call `Meteor.subscribe` inside [`Tracker.autorun`](#tracker_autorun), the
subscription will automatically be cancelled when the computation reruns,
meaning you don't have to to call `stop` on subscriptions made from inside
`autorun`.
{{/template}}