---
title: Collections and Models
---

After reading this guide, you'll know:

1. What the different flavors of Mongo Collection in Meteor are, and how to use them.
2. How to define a schema for a collection to control it's content.
3. What considerations you should take when defining your collection's schema
4. How to modify the content of a collection in a sensible way
5. How to change the schema of your collection in a careful way.
6. How to deal with relations between records in collections

## Mongo Collections in Meteor

At its core, a web application offers its users a view into, and a way to modify, a persistent set of data. Whether managing a list of todos, or ordering a car to pick you up, you are, at some level, fundamentally interacting with a permanent (if changing) data layer. 

In Meteor, that data layer is typically stored in the Mongo database engine. A set of data in Mongo is referred to as a "collection", and in Meteor, it's collections that forms the persistence layer.

However, collections are a lot more than a way to store data. They also provide the core of the realtime, connected user experience that the best applications provide, and which Meteor makes easy to implement.

In this article, we'll look closely at how collections work in various places in the framework, and how to get the most out of them.

### Server-side collections

When you create a collection on the server:
```js
Todos = new Mongo.Collection('Todos');
```

You are creating a collection within Mongo itself, and a interface to that collection to be used on the server. It's a fairly straightforward layer on top of the underlying Node Mongo driver, but with a synchronous (fibers-based) API:

```js
// This line won't complete until the insert is done
Todos.insert({_id: 'my-todo'});
// So this line will return something
const todo = Todos.findOne({_id: 'my-todo'});
// Look ma, no callbacks!
console.log(todo);
```

### Client-side collections

On the client, when you write the same line:
```js
Todos = new Mongo.Collection('Todos');
```

It does something totally different!

On the client, there is no direct connection to the Mongo database server, and in fact a sychronous API to it is not possible (nor probably what you want). Instead, on the client, a collection is a client side *cache* of the database, with a Mongo API. This is achieved thanks to the [Minimongo](https://www.meteor.com/mini-databases) library.

Minimongo is an in-memory, all JS, Mongo implementation. What this means is that on the client, when you write:
```js
// This line is changing an in-memory datastructure
Todos.insert({_id: 'my-todo'});
// And this line is querying it
const todo = Todos.findOne({_id: 'my-todo'});
// So this happens right away!
console.log(todo);
```

The way that you move data from the server (and Mongo-backed) collection into the client (in-memory) collection is the subject of the "data loading" article. But, generally speaking, you use a *subscription* to a *publication* to push data from the server to the client. Usually, you can assume that the client contains an up-to-date copy of some subset of the full Mongo collection.

To write data back to the server, you use a *method*, the subject of the "methods and forms" article.

### Local Collections

There is a third way to use a collection in Meteor. On the client or server, if you create a collection but do *not* give it a name:

```js
Scratch = new Mongo.Collection(null);
```
You create what's known as a *local collection*. This is a Minimongo collection that has no database connection (ordinarly a named collection would either be directly connected to the database on the server, or via a publication on the client). 

A local collection is simply a convienent way to use the full power of the Minimongo library for in-memory storage. For instance, you might use it instead of a simple array if you'll need to sophisticated queries over your set of data. Or you may want to take advatange of it's *reactivity* on the client to drive some UI in a way that feels natural in Meteor.

## Defining Collections with a Schema

Although Mongo is a schema-less database, which allows maximum flexibility in data structuring, it is generally good practice to use a schema to constraint the contents of your collection to conform to a known format. If you don't, then you tend to end up needing to write defensive code to check and confirm the structure of your data as it *comes out* of the database, instead of when it *goes into* the database. As in most things, you tend to *read things more often than you write them*, and so it's usually easier, and less buggy to use a schema.

In Meteor, the pre-eminent schema package is [aldeed:simple-schema](http://atmospherejs.com/aldeed/simple-schema). It's an expressive, Mongo based schema that's used to insert and update documents.

To write a schema using `simple-schema`, you can simply create a new instance of the `SimpleSchema` class:

```js
Lists.schema = new SimpleSchema({
  name: {type: String},
  incompleteCount: {type: Number, defaultValue: 0},
  userId: {type: String, regEx: SimpleSchema.RegEx.Id, optional: true}
});
```

In this example, from the Todos app, we are doing a few things that are interesting:

1. We attach the schema to the namespace of `Lists` directly. This allows us to check things against the schema of a list directly (rather than via inserting into the DB, see below), such as in a form (see the forms article).
2. We specify that the `name` field of a list must be a string, and must exist.
3. We specify the `incompleteCount` is a number, which on insertion is set to `0` if not otherwise specified.
4. We specify that the `userId`, which is optional, must be a string matching an id regular expression.

You can see from this example, that with relatively little code we've managed to restrict the format of a list significantly.

### Checking documents against a schema

Now we have a schema, how do we use it?

The straightforward way to use a schema is by using the `check` package. We can write:

```js
const list = {
  name: 'My list',
  incompleteCount: 3
};

check(list, Lists.schema);
```

In this case, as the list is valid according to the schema, the `check()` line will run without problems. If however, we wrote:

```js
const list = {
  name: 'My list',
  incompleteCount: 3,
  madeUpField: 'this should not be here'
};

check(list, Lists.schema);
```

// XXX: this isn't actually the case yet. Change this unless we update simple schema to do so..
Then the `check()` call will throw a `Meteor.ValidationError` which contains details about what is wrong with the `list` document.

### The `Meteor.ValidationError`

What is a `Meteor.ValidationError` [link to docs]? It's a special error that is used in Meteor to indicate a user-input based error in modifying a collection. Typically, the details on a `ValidationError` are used to mark up a form with information about what a user did wrong. In the "Methods and Forms" article, we'll see more about how this works.

## Designing your data schama

Now you are familiar with the basic API of Simple Schema, it's worth considering a few of the constraints of the Meteor system that can influence the design of your data schema. Although generally speaking you can build a Meteor data schema much like any Mongo data schema, there are some important differences.

The most important consideration is due to the way that DDP communicates documents over the wire. The key thing to realize is that DDP sends changes to documents at the level of document *fields*. What this means is that if you have large and complex subfields on document that change often, DDP can send unnecessary changes over the wire.

For instance, in "pure" Mongo you might design the schema so that each list document had a field called `todos` which was an array of todo items:

```js
Lists.schema = new SimpleSchema({
  name: {type: String},
  todos: {type: [Object]},
  'todos.$.text': {type: String}
});
```

(Notice the new Simple Schema syntax here, that allows you describe an array of objects one field at a time).

The issue with this schema is that due to the DDP behaviour just mentioned, each change to *any* todo item in a list will require sending the *entire* set of todos for that list over the wire. This is because DDP has no concept of "change the `text` field of the 3rd item in the field called `todos`", simply "change the field called `todos` to (say) `[{text: 'first'}, {text: 'second'}]`".

### Denormalization and multiple collections

The implication of the above is that we need to create more collections to contain sub-documents. In the case of the Todos application, we need both a `Lists` collection and a `Todos` collection to contain each list's todo items. Consequently we need to do more things that you'd typically associate with a SQL database, like using foreign keys (`todo.listId`) to associate one document with another.

In Meteor, it's often less of a problem doing this than it would be in a typical Mongo application, as we tend to publish overlapping sets of documents anyway (we might need one set of users to render one screen of our app, and an intersecting set for another), which may stay on the client as we move around the application. So in that scenario there is an advantage to separating the subdocuments from the parent.

However, given that Mongo doesn't support queries over multiple collections ("joins"), we typically end up having to denormalize some data back onto the parent collection. In the case of the Todos application, as we want to display the number of unfinished todos next to each list, we need to denormalize `list.incompleteTodoCount`. This is an inconvience but typically reasonably easy to do (see the "Forms and Methods" article for a discussion of patterns to do this).

Another denormalization that this architecture sometimes requires can be from the parent document onto sub-documents. For instance, in Todos, as we enforce privacy of the todo lists via the `list.userId` attribute, but we publish the todos separately, it makes sense to denormalize `todo.listId` also to ensure that we can do so easily.

### Designing schemas for the future

An application, especially a web application, is rarely finished, and it's useful to consider potential future changes when designing your data schema. As in most things, it's rarely a good idea to add fields before you actually need them (often what you anticipate doesn't actually end up happening, after all).

However, it's a good idea to think ahead to how the schema may change over time. For instance, you may have a list of strings on a document (perhaps a set of tags). Although it's tempting to leave them as a subfield on the document (assuming they don't change much), if there's a good change that they'll end up becoming more complicated in the future (perhaps tags will have a creator, or subtags later on?), then it might be easier in the long run to make a separate collection from the beginning.

As with all things it depends, and can be judgement call on your part.

## Using schemas -- writing data to collections

Although there are a variety of ways that you can run data through a Simple Schema before sending it to your collection (for instance you could check a schema in every method call), ultimately, the simplest and most reliable is to use the [`aldeed:collection2`](https://atmospherejs.com/aldeed/collection2) package to run every mutator (`insert/update/upsert` call) through the schema.

To do so, we use `attachSchema()`:

```js
Lists.attachSchema(Lists.schema);
```

What this means is that now every time we call `Lists.insert()`, `Lists.update()`, `Lists.upsert()`, first our document or modifier will be checked against the schema (in subtly different ways depending on the exact mutator). 

### Using `defaultValue` and cleaning

// XXX: do we actually like this?

One thing that Collection2 does is "cleans" data before sending it to the schema. This means, for instance, making an attempt to coerce types (converting strings to numbers for instance) amd removing attributes not in the schema.

Another important thing it does is set values to fields that have not been set, and which have `defaultValue` set in the schema definition.

However, sometimes it's useful to do more complex initialization to documents before inserting them into collections. For instance, in the Todos app, we want to set the name of new lists to be `List X` where `X` is the next available unique letter.

To do so, we can subclass `Mongo.Collection` and write our own `insert()` method:

```js
class ListsCollection extends Mongo.Collection {
  insert(list, callback) {
    if (!list.name) {
      let nextLetter = 'A';
      list.name = `List ${nextLetter}`;

      while (Lists.findOne({name: list.name})) {
        // not going to be too smart here, can go past Z
        nextLetter = String.fromCharCode(nextLetter.charCodeAt(0) + 1);
        list.name = `List ${nextLetter}`;
      }
    }

    return super(list, callback);
  }
}

Lists = new ListsCollection('Lists');
```

### Writing "hooks"

The technique above can also be used to provide a location to "hook" extra functionality into the collection. For instance, when removing a list, we *always* want to remove all of its todos at the same time.

To do so in an easy to understand way, we can again subclass, overriding the `remove()` method:

```js
class ListsCollection extends Mongo.Collection {
  ...
  remove(selector, callback) {
    Package.todos.Todos.remove({listId: selector});
    return super(selector, callback);
  }
}
```

This technique has a couple of downsides:

  1. Mutators can get very long when you want to hook in multiple times
  2. Sometimes a single piece of functionality can be spread over multiple mutators
  3. It can be a challenge to write a hook in a completely general way (that covers every possible selector and modifier), and it may not be necessary for your application (because perhaps you only ever call that mutator in one way).

A way to deal with points 1. and 2. is to separate out the set of hooks into their own module, and simply use the mutator as a point to call out to that module in a sensible way. We can see in the "Forms and Methods" chapter an example of how we do that in the list and todo denormalizers mentioned above.

Point 3. can usually be resolved by placing the hook in the *Method* that calls the mutator, rather than the hook itself. Although this is an imperfect compromise (as we need to be careful if we ever add another Method that calls that mutator in the future), it is better than writing a bunch of code that is never actually called (which is guaranteed to not work!), or giving the impression that your hook is more general that it actually is.


# OUTLINE: Collections and Models

1. Mongo Collections in Meteor
  1. Server side Mongo "real" collections backed by a DB
  2. Client side Minimongo "remote-backed" collections backed by a DDP connection
  3. Local Minimongo Collections backed by nothing.
2. Definining a Collection with a Schema
  1. Why schemas are important in a schema-less db
    1. Controlling the database
    2. Avoiding "writing schemas in code" -- which is what you end up doing if you don't have a schema
  2. The Simple Schema package and how to define a schema
  3. Using schemas -- running a validation, getting errors back
  4. The `ValidationError` and how it relates to the form chapter.
3. Mutating data -- writing insert/update/remove functions
  1. Using an instance of a `Collection2` to force Schema checks.
  2. Using `autovalue` and `defaultValue` to "define" more complex insert/update code.
  3. Subclassing `Collection2` to do arbitrary things on mutations.
  4. "Hooking" data by subclassing Collection2.
    1. Description of the need for hooks
    2. How the careful use of utilities can allow readable mutators that have hooks
  5. EG: Denormalization patterns
    1. Define your denormalizer in a different file
    2. Hook the denormalizer in various `insert/update/remove` functions
4. Designing your data schema
  1. "Impure" mongo -- i.e. things that Meteor will force you to do that you might not have done otherwise
    - Avoid subdocuments and large changing properties
    - Use more collections, normalize more
  2. Thinking ahead to future database changes
    - Don't try to predict the future but be flexible
5. Changing data schema - how to use migrations
  1. percolate:migrations package
  2. How to run migrations against a production db
    [is our best advice run locally pointing at the production db, use Meteor shell?]
  3. Multiple stage deploys which can handle both new and old format
6. Relational data and other helpers
  1. Using `dburles:collection-helpers` to add "methods" to your documents
  2. Returning a cursors from a helper to get related documents
  3. Using a `cursor-utils` package to narrow down cursors etc [HELP NEEDED?]
7. Advanced schema usage
  1. https://github.com/aldeed/meteor-simple-schema
  4. Using JSONSchema with SS
