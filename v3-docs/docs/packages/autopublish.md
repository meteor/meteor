# autopublish

`autopublish` publishes **all** server collections to every connected client automatically, without you having to write any `Meteor.publish` calls. It is meant for **prototyping only** — it lets you build an app quickly without thinking about which data each client can see, and should be removed as soon as your app needs to control data access.

```bash
meteor add autopublish
```

As of Meteor 3.x, `autopublish` is **not** included in new projects by default; add it explicitly when prototyping.

## How it works

The `autopublish` package contains no code of its own. Its presence is detected by other core packages (such as `ddp-server` and `mongo`), which check for `Package.autopublish` and, when it is present, automatically publish every collection to all clients. This is why simply adding the package is enough — there is no API to call.

## Removing it

When you are ready to control what each client receives, remove the package and write explicit publications:

```bash
meteor remove autopublish
```

Then define your own [publications and subscriptions](../api/meteor.md#pubsub) with `Meteor.publish` / `Meteor.subscribe`. Removing `autopublish` is a prerequisite for restricting which documents and fields reach the client.

## See also

- `insecure` — the write-side counterpart for prototyping (allows all client-side database writes).
- [Publish and Subscribe](../api/meteor.md#pubsub) — the API to replace `autopublish` with explicit publications.
