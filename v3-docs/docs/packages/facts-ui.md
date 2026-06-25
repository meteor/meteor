# facts-ui

`facts-ui` displays the internal application statistics ("facts") collected by `facts-base`. It provides a client-side Blaze template, <span v-pre>`{{> serverFacts}}`</span>, that subscribes to the server facts and renders them grouped by package.

```bash
meteor add facts-ui
```

Adding `facts-ui` implies `facts-base` (`api.imply("facts-base")`), so you get the fact-collection machinery as well. The package depends on `templating`, so it is intended for apps that use Blaze.

## Displaying the facts

Render the `serverFacts` template anywhere in your UI:

```handlebars
{{> serverFacts}}
```

The template renders an unordered list with one entry per package; for each package it shows a definition list of every fact name and its current value. It subscribes to the server facts when created and unsubscribes when destroyed.

## The client collection

On the client, `facts-ui` attaches the facts collection to the exported `Facts` object:

- **`Facts.server`** — a `Mongo.Collection` (named `meteor_Facts_server`) holding one document per package, where each document's fields are that package's facts. This is the same data the <span v-pre>`{{> serverFacts}}`</span> template reads, exposed so you can build your own UI if you don't want to use the built-in template.

```js
import { Facts } from 'meteor/facts-base';

// reactive: every package's current facts
const allPackageFacts = Facts.server.find().fetch();
```

> Who can see the facts is controlled on the server by `facts-base` (via `Facts.setUserIdFilter` and the presence of `autopublish`). If no facts appear, make sure the current user is permitted to subscribe.

## Notes

> The package `README.md` labels `facts-ui` an internal Meteor package. It is documented here because it provides a public template (<span v-pre>`{{> serverFacts}}`</span>) and the `Facts.server` collection that app authors can use directly.

## See also

- `facts-base` — collects and publishes the facts that this package displays, and defines the `Facts.incrementServerFact` / `Facts.setUserIdFilter` server API.
