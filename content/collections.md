---
title: Collections and Models
---

After reading this guide, you'll know:

1. What the different flavors of Mongo Collection in Meteor are, and how to use them.
2. How to define a schema for a collection to control it's content.
3. How to modify the content of a collection in a sensible way
4. What considerations you should take when defining your collection's schema
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
4. Custom mutators
  1. In a public API it's best to be *less* general rather than *more* general (see security article)
  2. Your methods are your public API.
  3. So write a `bar.addFoo` mutator rather than allowing `bar.update` to add `foo`.
  4. Using the `Method` pattern to wrap a mutator in a public API of the same name.
    1. Reference to Dave Weldon's post on the subject / see also Form chapter.
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
8. Other packages / approaches
  1. Astronomy
    1. Brings the "ORM-y" `.save()` to your models.
  2. Collection hooks
    1. Allows you to follow a hook/aspect oriented patterns you don't need to fully describe your mutators in one go.
