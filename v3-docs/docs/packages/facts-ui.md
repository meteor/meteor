# facts-ui

`facts-ui` displays the internal application statistics ("facts") collected by `facts-base`. It provides a client-side Blaze template, <span v-pre>`{{> serverFacts}}`</span>, that subscribes to the server facts and renders them grouped by package.

```bash
meteor add facts-ui
```

Adding `facts-ui` implies `facts-base`, so you get the fact-collection machinery as well. The package depends on `templating`, so it is intended for apps that use Blaze.

## Displaying the facts

Render the `serverFacts` template anywhere in your UI:

```handlebars
{{> serverFacts}}
```

The template renders an unordered list with one entry per package; for each package it shows a definition list of every fact name and its current value. It subscribes to the server facts when created and unsubscribes when destroyed.

## A complete example

First, make sure the server actually produces facts and that this client is allowed to see them. By default (without `autopublish`) facts are published to **no one**, so during development you typically need an explicit filter:

```js
// server
import { Facts } from 'meteor/facts-base';

Facts.setUserIdFilter(() => true); // dev only — publish facts to everyone
Facts.incrementServerFact('my-app', 'jobs-run', 1);
```

Assuming the server increments some facts (see `facts-base`), display them in a Blaze app:

```handlebars
<!-- in one of your templates -->
{{> serverFacts}}
```

If you are **not** using Blaze, read the same data directly from the reactive `Facts.server` collection and render it however you like (React, Vue, Svelte, etc.):

```js
import { Facts } from 'meteor/facts-ui'; // Facts.server is attached by facts-ui

// make sure the data is being published to this client
Meteor.subscribe('meteor_facts');

// reactive: one document per package, fields are that package's facts
const rows = Facts.server.find().fetch();
// e.g. rows = [{ _id: 'mongo-livedata', 'observe-handles': 3, ... }]
```

`Facts.server.find()` is reactive only inside a reactive context — wrap it in `Tracker.autorun` (or your framework's reactive hook, e.g. `useTracker`) to get live updates; a plain `.fetch()` in a component body runs once.

> Remember that whether any facts reach the client is decided on the server by `facts-base` (`Facts.setUserIdFilter` and the presence of `autopublish`). The built-in `serverFacts` template already subscribes to `meteor_facts` for you.

## The client collection

On the client, `facts-ui` attaches the facts collection to the exported `Facts` object:

- **`Facts.server`** — a `Mongo.Collection` (named `meteor_Facts_server`) holding one document per package, where each document's fields are that package's facts. This is the same data the <span v-pre>`{{> serverFacts}}`</span> template reads, exposed so you can build your own UI if you don't want to use the built-in template.

```js
import { Facts } from 'meteor/facts-ui'; // Facts.server is attached by facts-ui

// reactive: every package's current facts
const allPackageFacts = Facts.server.find().fetch();
```

> Who can see the facts is controlled on the server by `facts-base` (via `Facts.setUserIdFilter` and the presence of `autopublish`). If no facts appear, make sure the current user is permitted to subscribe.

## See also

- [`facts-base`](./facts-base.md) — collects and publishes the facts that this package displays, and defines the `Facts.incrementServerFact` / `Facts.setUserIdFilter` server API.
