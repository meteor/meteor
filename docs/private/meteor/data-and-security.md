<h2 id="dataandsecurity">Data and security</h2>

Meteor makes writing distributed client code as simple as talking to a
local database.  It's a clean, simple, and secure approach that obviates
the need to implement individual RPC endpoints, manually cache data on
the client to avoid slow roundtrips to the server, and carefully
orchestrate invalidation messages to every client as data changes.

In Meteor, the client and server share the same database API.  The same
exact application code &mdash; like validators and computed properties &mdash; can
often run in both places.  But while code running on the server has
direct access to the database, code running on the client does *not*.
This distinction is the basis for Meteor's data security model.

{{#note}}
By default, a new Meteor app includes the `autopublish` and `insecure`
packages, which together mimic the effect of each client having full
read/write access to the server's database.  These are useful
prototyping tools, but typically not appropriate for production
applications.  When you're ready, just remove the packages.
{{/note}}

Every Meteor client includes an in-memory database cache.  To manage the
client cache, the server *publishes* sets of JSON documents, and the
client *subscribes* to those sets.  As documents in a set change, the
server patches each client's cache.

Today most Meteor apps use MongoDB as their database because it is the
best supported, though support for other databases is coming in the
future. The
[`Meteor.Collection`](http://docs.meteor.com/#meteor_collection) class
is used to declare Mongo collections and to manipulate them. Thanks to
`minimongo`, Meteor's client-side Mongo emulator, `Meteor.Collection`
can be used from both client and server code.

    // declare collections
    // this code should be included in both the client and the server
    Rooms = new Meteor.Collection("rooms");
    Messages = new Meteor.Collection("messages");
    Parties = new Meteor.Collection("parties");

    // server: populate collections with some initial documents
    Rooms.insert({name: "Conference Room A"});
    var myRooms = Rooms.find({}).fetch();
    Messages.insert({text: "Hello world", room: myRooms[0]._id});
    Parties.insert({name: "Super Bowl Party"});

Each document set is defined by a publish function on the server.  The
publish function runs each time a new client subscribes to a document
set.  The data in a document set can come from anywhere, but the common
case is to publish a database query.

    // server: publish all room documents
    Meteor.publish("all-rooms", function () {
      return Rooms.find(); // everything
    });

    // server: publish all messages for a given room
    Meteor.publish("messages", function (roomId) {
      check(roomId, String);
      return Messages.find({room: roomId});
    });

    // server: publish the set of parties the logged-in user can see.
    Meteor.publish("parties", function () {
      return Parties.find({$or: [{"public": true},
                                 {invited: this.userId},
                                 {owner: this.userId}]});
    });

Publish functions can provide different results to each client.  In the
last example, a logged in user can only see `Party` documents that
are public, that the user owns, or that the user has been invited to.

Once subscribed, the client uses its cache as a fast local database,
dramatically simplifying client code.  Reads never require a costly
round trip to the server.  And they're limited to the contents of the
cache: a query for every document in a collection on a client will only
return documents the server is publishing to that client.

    // client: start a parties subscription
    Meteor.subscribe("parties");

    // client: return array of Parties this client can read
    return Parties.find().fetch(); // synchronous!

Sophisticated clients can turn subscriptions on and off to control how
much data is kept in the cache and manage network traffic.  When a
subscription is turned off, all its documents are removed from the cache
unless the same document is also provided by another active
subscription.

When the client *changes* one or more documents, it sends a message to
the server requesting the change.  The server checks the proposed change
against a set of allow/deny rules you write as JavaScript functions.
The server only accepts the change if all the rules pass.

    // server: don't allow client to insert a party
    Parties.allow({
      insert: function (userId, party) {
        return false;
      }
    });

    // client: this will fail
    var party = { ... };
    Parties.insert(party);

If the server accepts the change, it applies the change to the database
and automatically propagates the change to other clients subscribed to
the affected documents.  If not, the update fails, the server's database
remains untouched, and no other client sees the update.

Meteor has a cute trick, though.  When a client issues a write to the
server, it also updates its local cache immediately, without waiting for
the server's response.  This means the screen will redraw right away.
If the server accepted the update &mdash; what ought to happen most of the
time in a properly behaving client &mdash; then the client got a jump on the
change and didn't have to wait for the round trip to update its own
screen.  If the server rejects the change, Meteor patches up the
client's cache with the server's result.

Putting it all together, these techniques accomplish latency
compensation.  Clients hold a fresh copy of the data they need, and
never need to wait for a roundtrip to the server. And when clients
modify data, those modifications can run locally without waiting for the
confirmation from the server, while still giving the server final say
over the requested change.

{{#note}}
The current release of Meteor supports MongoDB, the popular document
database, and the examples in this section use the
        [MongoDB API](http://www.mongodb.org/display/DOCS/Manual).  Future
releases will include support for other databases.
{{/note}}

<h3 id="dataandsecurity-authentication">Authentication and user accounts</h3>

Meteor includes [Meteor Accounts](#accounts_api), a state-of-the-art
authentication system. It features secure password login using the
[Secure Remote Password
protocol](http://en.wikipedia.org/wiki/Secure_Remote_Password_protocol),
and integration with external services including Facebook, GitHub,
Google, Meetup, Twitter, and Weibo. Meteor Accounts defines a
[`Meteor.users`](#meteor_users) collection where developers can store
application-specific user data.

Meteor also includes pre-built forms for common tasks like login, signup,
password change, and password reset emails. You can add [Accounts
UI](#accountsui) to your app with just one line of code. The `accounts-ui` package even provides a configuration wizard that walks you through the steps to
set up the external login services you're using in your app.

<h3 id="dataandsecurity-validation">Input validation</h3>

Meteor allows your methods and publish functions to take arguments of any
[JSON](http://json.org/) type. (In fact, Meteor's wire protocol supports
[EJSON](#ejson), an extension of JSON which also supports other common types
like dates and binary buffers.) JavaScript's dynamic typing means you don't need
to declare precise types of every variable in your app, but it's usually helpful
to ensure that the arguments that clients are passing to your methods and
publish functions are of the type that you expect.

Meteor provides a [lightweight library](#match) for checking that arguments and
other values are the type you expect them to be. Simply start your functions
with statements like `check(username, String)` or
`check(office, {building: String, room: Number})`. The `check` call will
throw an error if its argument is of an unexpected type.

Meteor also provides an easy way to make sure that all of your methods
and publish functions validate all of their arguments. Just run
<code>meteor add [audit-argument-checks](#auditargumentchecks)</code> and any
method or publish function which skips `check`ing any of its arguments will fail
with an exception.
