{{#template name="basicCollections"}}

<h2 id="b-collections"><span>Collections</span></h2>

Meteor stores data in *collections*. JavaScript objects stored in collections
are called `documents`.  To get started, declare a collection with `new
Mongo.Collection`.

{{> autoApiBox "Mongo.Collection"}}

Calling this constructor creates a collection object which acts just like a
MongoDB collection. If you pass a name when you create the collection, then you
are declaring a persistent collection — one that is stored on the server and
seen by all users.

Since client code and server code can both access the same collection using the
same API, it's usually best to declare persistent collections as global
variables in a JavaScript file that's present on the client and the server.

Here's an example of declaring a collection:

```
// In a JS file that's loaded on the client and server
Posts = new Mongo.Collection("posts");
Comments = new Mongo.Collection("comments");
```

If you pass null as the name, then you're creating a local collection. It's not
synchronized anywhere; it's just a local collection of JavaScript objects that
supports Mongo-style find, insert, update, and remove operations.

By default, Meteor automatically publishes every document in your collection to
each connected client. To turn this behavior off, remove the autopublish
package:

```
$ meteor remove autopublish
```

Then, use [`Meteor.publish`](#meteor_publish) and
[`Meteor.subscribe`](#meteor_subscribe) to specify which parts of your
collection should be published to which clients.

Use `findOne` or `find` to retrieve documents from a collection.

{{> autoApiBox "Mongo.Collection#findOne"}}

This method lets you retrieve a specific document from your collection. It is
simplest to call it with a document id:

```
var post = Posts.findOne(postId);
```

You can also call `findOne` with a Mongo selector, which is an object that
specifies a set of rules for the document you're looking for:

```
// this selector
var post = Posts.findOne({
  createdBy: "12345",
  title: {$regex: /first/}
});

// will match this document
{
  createdBy: "12345",
  title: "My first post!",
  content: "Today was a good day."
}
```

You can read about MongoDB query operators such as `$regex`, `$lt` (less than),
`$text` (text search), and more in the [MongoDB
documentation](http://docs.mongodb.org/manual/reference/operator/query/). One
interesting thing to note is that Mongo selectors also match items in arrays.
For example:

```
// this selector
Post.findOne({
  tags: "meteor"
});

// will match this document
{
  title: "I love Meteor",
  createdBy: "242135223",
  tags: ["meteor", "javascript", "fun"]
}
```

The `findOne` method is reactive just like [`Session.get`](#session_get),
meaning if you use it inside a [template helper](#template_helpers) or a
[`Tracker.autorun`](#tracker_autorun), it will automatically rerender
the view or rerun the computation if the returned document changes. This also
means that sometimes `findOne` will return `null` if the document is removed
from the collection, so you should be prepared to accept that value.

{{> autoApiBox "Mongo.Collection#find"}}

The `find` method is similar to `findOne`, but instead of returning a single
document it returns a MongoDB cursor. A cursor is a special object that refers
to the documents that might be returned from a query. You can pass a cursor into
a template helper anywhere you could pass an array:

```
Template.blog.helpers({
  posts: function () {
    // this helper returns a cursor of
    // all of the posts in the collection
    return Posts.find();
  }
});
```

```
<!-- a template that renders multiple posts -->
<template name="blog">
  {{dstache}}#each posts}}
    <h1>{{dstache}}title}}</h1>
    <p>{{dstache}}content}}</p>
  {{dstache}}/each}}
</template>
```

If you want to actually retrieve all of the documents from a cursor, call
`.fetch()` like this:

```
// get an array of posts
var postsArray = Posts.find().fetch();
```

Keep in mind that while the computation in which you call `fetch` will rerun
when the data changes, the resulting array will not be reactive if it is
passed somewhere else.

You can modify the data stored in a `Mongo.Collection` by calling `insert`,
`update`, or `remove`.

{{> autoApiBox "Mongo.Collection#insert"}}

Here's how you insert a document into a collection:

```
Posts.insert({
  createdBy: Meteor.userId(),
  createdAt: new Date(),
  title: "My first post!",
  content: "Today was a good day."
});
```

Every document in every `Mongo.Collection` has an `_id` field. It must be
unique, and is automatically generated if you don't provide one. The `_id`
field should be used to refer to a specific document, and can be used to
retrieve that document using [`collection.findOne`](#findOne).

{{> autoApiBox "Mongo.Collection#update"}}

The selector here is just like the one you would pass to `find`, and can
match multiple documents. The modifier is an object that specifies which
changes should be made to the matched documents. Watch out - unless you use
an operator like `$set`, `update` will simply replace the entire matched
document with the modifier.

```
// Sets the content field on all posts
// that have 'first' in the title
Posts.update({
  title: {$regex: /first/}
}, {
  $set: { content: "Tomorrow will be a great day." }
});
```

You can read about all of the different operators that are supported in the
[MongoDB documentation](http://docs.mongodb.org/manual/reference/operator/update/).

There's one catch: when you call `update` on the client, you can only find
documents by theid `_id` field. To use all of the possible selectors, you must
call `update` in server code or from a [method](#meteor_methods).

{{> autoApiBox "Mongo.Collection#remove"}}

This method uses the same selectors as `find` and `update`, and removes any
documents that match the selector from the database. Use `remove` carefully -
there's no way to get that data back.

Just like with `update`, you can only remove documents by using their `_id`
field unless `remove` is called in server code or from a
[method](#meteor_methods).



{{> autoApiBox "Mongo.Collection#allow"}}

In newly created apps, Meteor allows almost any calls to `insert`, `update`, and
`remove` from any client or server code. This is because apps started with
`meteor create` include the `insecure` package by default to speed up
development. Obviously, if any user could change the database whenever they
wanted it would be bad for security, so we should remove `insecure` and specify
some permissions rules.

```
$ meteor remove insecure
```

Once we have removed this package, we can use the `allow` and `deny` methods to
control who can perform which operations on the database. By default, all
operations on the client are denied, so we need to add some `allow` rules.
Keep in mind that server code and code inside [methods](#meteor_methods) is
not affected by `allow` and `deny` - these rules only apply when `insert`,
`update`, and `remove` are called from untrusted client code.

For example, we might say that users can only create new posts if the
`createdBy` field matches the ID of the current user, so that users can't
impersonate each other.

```
// In a file loaded on the client and server
Posts.allow({
  insert: function (userId, post) {
    // can only create posts where you are the author
    return post.createdBy === userId;
  },
  remove: function (userId, post) {
    // can only delete your own posts
    return post.createdBy === userId;
  }
  // since there is no update field, all updates
  // are automatically denied
});
```

There are three possible callbacks, that get different arguments. The first
argument is always the `_id` of the logged in user.

1. `insert(userId, document)`

    `document` is the document that is about to be inserted into the database.
    Return `true` if the insert should be allowed, `false` otherwise.

2. `update(userId, document, fieldNames, modifier)`

    `document` is the document that is about to be modified. `fieldNames` is an
    array of top-level fields that are affected by this change. `modifier` is
    the [Mongo Modifier](#mongo_modifiers) that was passed as the second
    argument of `collection.update`. It can be difficult to achieve correct
    validation using this callback, so it is recommended to use
    [methods](#meteor_methods) instead. Return `true` if the update should be
    allowed, `false` otherwise.

3. `remove(userId, document)`

    `document` is the document that is about to be removed from the database.
    Return `true` if the document should be removed, `false` otherwise.

{{> autoApiBox "Mongo.Collection#deny"}}

Deny lets you override parts of your `allow` rules. While only one of your
`allow` callbacks has to return true to allow a modification, _every one_ of
your `deny` callbacks has to return false for the database change to happen.

For example, if we wanted to override part of our `allow` rule above to exclude
certain post titles:

```
// In a file loaded on the client and server
Posts.deny({
  insert: function (userId, post) {
    // Don't allow posts with a certain title
    return post.title === "First!";
  }
});
```

{{/template}}