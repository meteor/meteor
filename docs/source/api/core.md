---
title: Core
description: Documentation of core Meteor functions.
---

If you prefer to watch the video, click below.

{% youtube 6RRVU0-Vvm8 %}

{% apibox "Meteor.isClient" %}
{% apibox "Meteor.isServer" %}

> `Meteor.isServer` can be used to limit where code runs, but it does not
prevent code from being sent to the client. Any sensitive code that you
don't want served to the client, such as code containing passwords or
authentication mechanisms, should be kept in the `server` directory.

{% apibox "Meteor.isCordova" %}
{% apibox "Meteor.isDevelopment" %}
{% apibox "Meteor.isProduction" %}

{% apibox "Meteor.startup" %}

On a server, the function will run as soon as the server process is
finished starting. On a client, the function will run as soon as the DOM
is ready. Code wrapped in `Meteor.startup` always runs after all app
files have loaded, so you should put code here if you want to access
shared variables from other files.

The `startup` callbacks are called in the same order as the calls to
`Meteor.startup` were made.

On a client, `startup` callbacks from packages will be called
first, followed by `<body>` templates from your `.html` files,
followed by your application code.

```js
// On server startup, if the database is empty, create some initial data.
if (Meteor.isServer) {
  Meteor.startup(() => {
    if (Rooms.find().count() === 0) {
      Rooms.insert({ name: 'Initial room' });
    }
  });
}
```

{% apibox "Meteor.onShutdown" %}

On `SIGTERM` or `SIGINT`, registered shutdown hooks run sequentially in
reverse registration order (LIFO), so dependent resources can tear down
before the resources they depend on. Each hook may be `async`; the next
hook does not start until the previous one resolves.

If a hook throws or rejects, the error is logged and subsequent hooks
still run (best-effort cleanup). Total shutdown time is capped by the
`METEOR_SHUTDOWN_TIMEOUT_MS` environment variable (default `10000`);
when the cap is reached the process exits even if hooks are still
running, to avoid stalling supervisor escalation (Galaxy, Kubernetes,
systemd) to `SIGKILL`. Set it to `0` to disable the cap and wait for hooks
indefinitely; set it to a small value (e.g. `1`) to exit almost immediately.

A second `SIGTERM`/`SIGINT` received while shutdown is already running is
treated as a force-quit (e.g. double Ctrl-C): the process exits at once
without waiting for the remaining hooks or the timeout.

Exit codes follow POSIX convention: `SIGINT` → 130, `SIGTERM` → 143.

`Meteor.onShutdown` is server-only — there is no client equivalent.

```js
import { Meteor } from 'meteor/meteor';

Meteor.onShutdown(async (signal) => {
  console.log(`Shutting down on ${signal}, flushing pending writes...`);
  await jobQueue.flush();
  await mongoClient.close();
});
```

{% apibox "Meteor.wrapAsync" %}

{% apibox "Meteor.defer" %}

{% apibox "Meteor.absoluteUrl" %}

{% apibox "Meteor.settings" %}

{% apibox "Meteor.release" %}

{% apibox "Meteor.isModern" %}

{% apibox "Meteor.gitCommitHash" %}

{% apibox "Meteor.isTest" %}

{% apibox "Meteor.isAppTest" %}

{% apibox "Meteor.isPackageTest" %}

{% apibox "Meteor.isFibersDisabled" %}
