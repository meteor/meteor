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

## See also

- `autopublish` — the read-side counterpart for prototyping (publishes all collections to all clients).
- [Methods](../api/meteor.md#methods) — the recommended way to perform validated writes after removing `insecure`.
