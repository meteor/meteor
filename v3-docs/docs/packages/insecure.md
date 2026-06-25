# insecure

`insecure` allows almost all collection methods — such as `insert`, `update`, and `remove` — to be called directly from the client, without writing any `allow`/`deny` rules. It is meant for **prototyping only**: it lets you build an app quickly without worrying about database permissions, and should be removed as soon as your app needs to restrict database access.

```bash
meteor add insecure
```

As of Meteor 3.x, `insecure` is **not** included in new projects by default; add it explicitly when prototyping.

## Usage

**Adding the package is all you need to do — there is nothing to configure.** `insecure` exposes no JavaScript API and reads no settings; its mere presence lets clients run `insert`/`update`/`remove` on collections that have no explicit `allow`/`deny` rules. To turn the behavior off, you remove the package (see [Removing it](#removing-it)).

## How it works

The `insecure` package contains no code of its own. Its presence is detected by Meteor's MongoDB integration, which — when the package is present — allows client-originated writes to collections that have no explicit `allow`/`deny` rules. This is why simply adding the package is enough; there is no API to call.

## Removing it

When you are ready to control client writes, remove the package and define explicit security rules:

```bash
meteor remove insecure
```

After removing `insecure`, client-side writes to a collection are denied unless you either:

- define `allow`/`deny` rules on the collection, or
- perform the writes inside [Meteor Methods](../api/meteor.md#methods) on the server.

### Example: replacing insecure with a Method

The recommended approach in modern Meteor is to keep all writes in [Methods](../api/meteor.md#methods) rather than allowing client-side database calls:

```js
// server (define on the client too if you want latency compensation)
import { check } from 'meteor/check';

Meteor.methods({
  async 'tasks.insert'(text) {
    check(text, String);
    if (!this.userId) throw new Meteor.Error('not-authorized');
    await Tasks.insertAsync({ text, owner: this.userId, createdAt: new Date() });
  },
});
```

```js
// client
await Meteor.callAsync('tasks.insert', 'Buy milk');
```

Keeping `insecure` in a production app is a security risk, because any client could insert, update, or remove arbitrary documents.

> **Important:** `insecure` works **per collection** and only on collections that have **no** `allow`/`deny` rules. Calling `allow()` or `deny()` even once on a collection makes it "restricted" and `insecure` is ignored for that collection — which is exactly how you migrate off it one collection at a time. Also note that `meteor remove insecure` flips every rule-less collection to deny-all at once, so all client writes that relied on it stop working until you've added Methods (or rules) for them.

## See also

- `autopublish` — the read-side counterpart for prototyping (publishes all collections to all clients).
- [Methods](../api/meteor.md#methods) — the recommended way to perform validated writes after removing `insecure`.
