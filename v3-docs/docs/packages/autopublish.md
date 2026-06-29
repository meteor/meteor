# autopublish

`autopublish` publishes **all** server collections to every connected client automatically, without you having to write any `Meteor.publish` calls. It is meant for **prototyping only** — it lets you build an app quickly without thinking about which data each client can see, and should be removed as soon as your app needs to control data access.

```bash
meteor add autopublish
```

As of Meteor 3.x, `autopublish` is **not** included in new projects by default; add it explicitly when prototyping.

## Usage

**Adding the package is all you need to do — there is nothing to configure.** `autopublish` exposes no JavaScript API and reads no settings; its mere presence makes the server publish every collection to all connected clients, so you don't write any `Meteor.publish` calls while it is installed. To turn the behavior off, you remove the package (see [Removing it](#removing-it)).

## How it works

The `autopublish` package exposes no JavaScript API of its own. Its presence is detected by the `mongo` package, which — when the package is installed — automatically publishes every collection to all clients. The `ddp-server` package also checks for `autopublish`, but only to **warn** you when you write a manual `Meteor.publish` while it is still installed; it does not publish anything itself. This is why simply adding the package is enough — there is no API to call.

## Removing it

When you are ready to control what each client receives, remove the package and write explicit publications:

```bash
meteor remove autopublish
```

Then define your own [publications and subscriptions](../api/meteor.md#pubsub) with `Meteor.publish` / `Meteor.subscribe`. Removing `autopublish` is a prerequisite for restricting which documents and fields reach the client.

### Example: replacing autopublish with a publication

```js
// server
Meteor.publish('myTasks', function () {
  if (!this.userId) return this.ready();
  return Tasks.find({ owner: this.userId });
});
```

```js
// client
Meteor.subscribe('myTasks');
```

This sends each client only the documents it should see, instead of the entire database. Keeping `autopublish` in a production app is a security risk because every client receives every collection.

> **Migration caveat:** while `autopublish` is still installed, your manual `Meteor.publish` calls have no real effect — clients still receive everything, and the server logs a warning to that effect. Your publications only start restricting data once you actually **remove** the package.

## See also

- `insecure` — the write-side counterpart for prototyping (allows all client-side database writes).
- [Publish and Subscribe](../api/meteor.md#pubsub) — the API to replace `autopublish` with explicit publications.
