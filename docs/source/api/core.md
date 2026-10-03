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

Every Meteor server process also needs a `main` function. The `webapp`
package supplies one that starts the HTTP server. Apps that omit `webapp`
must provide their own `main` as a package export or on the global object,
or startup exits with `Program has no main() function.`

{% apibox "Meteor.onShutdown" %}

On `SIGTERM` or `SIGINT`, the server runs the registered hooks one at a time in
reverse registration order (LIFO), so resources tear down before the resources
they depend on. A hook may be `async`; the next hook starts once the previous
one settles. If a hook throws or rejects, the error is logged and the remaining
hooks still run. When the last hook finishes, the process exits with code 130
(`SIGINT`) or 143 (`SIGTERM`). `Meteor.onShutdown` is server-only.

```js
import { Meteor } from 'meteor/meteor';

Meteor.onShutdown(async (signal) => {
  console.log(`Shutting down on ${signal}, flushing pending writes...`);
  await jobQueue.flush();
});
```

`Meteor.onShutdown` runs cleanup code; it does not shut the server down
gracefully by itself. While the hooks run, Meteor keeps accepting HTTP requests
and DDP messages, and it neither waits for in-flight requests or methods nor
closes existing connections. Stopping intake and draining connections remain the
responsibility of the application and its packages.

`METEOR_SHUTDOWN_TIMEOUT_MS` caps the total time the hooks may take (default
`10000`). When the cap is reached, the process exits even if hooks are still
running. `0` disables the cap; invalid or negative values, and values above
Node's maximum timer delay (`2147483647`), fall back to the default with a
warning. A second `SIGTERM` or `SIGINT` received during shutdown (e.g. a double
Ctrl-C) exits immediately.

In a built or deployed application, this timeout is the only Meteor deadline,
but the hosting platform may enforce an earlier one: Galaxy, Kubernetes and
systemd send `SIGKILL` once their own grace period expires, so keep
`METEOR_SHUTDOWN_TIMEOUT_MS` below it. During development, `meteor run` applies
its own deadline regardless of `METEOR_SHUTDOWN_TIMEOUT_MS`: when it restarts
the app, it sends `SIGKILL` about 3 seconds after `SIGTERM` if the old process
is still running, and when `meteor run` itself exits, the app stops within about
3 seconds. A hook that needs 5 seconds can therefore complete in production
under the default timeout but be interrupted in development.

Meteor listens for `SIGTERM` and `SIGINT` only once the first hook is
registered, so an application that registers no hook keeps its existing signal
handling. Once a hook is registered, Meteor exits after the last hook finishes.
It gives raw `process.on('SIGTERM', ...)` listeners one event-loop turn, but it
does not wait for their promises or timers, so move asynchronous cleanup from
those listeners into `Meteor.onShutdown`. This applies to
[`@meteorjs/ddp-graceful-shutdown`](https://github.com/meteor/ddp-graceful-shutdown),
whose `installSIGTERMHandler()` closes connections gradually over a grace
period. In an application that registers shutdown hooks, call
`closeConnections()` from a hook and wait for the connections to close
instead:

```js
import { Meteor } from 'meteor/meteor';
import { DDPGracefulShutdown } from '@meteorjs/ddp-graceful-shutdown';

const gracePeriodMillis = 5000;
const ddpGracefulShutdown = new DDPGracefulShutdown({
  gracePeriodMillis,
  server: Meteor.server,
});

// Hooks run in reverse order: register this one after the hooks that close
// resources the connections still use, so it drains them first.
Meteor.onShutdown(async () => {
  ddpGracefulShutdown.closeConnections({ log: true });
  // closeConnections() returns at once and chains its closes on timers, which
  // can run past the grace period: wait until every connection is closed.
  while (ddpGracefulShutdown.connections.size > 0) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
});
```

Keep `METEOR_SHUTDOWN_TIMEOUT_MS` comfortably above the grace period, and both
below the hosting platform's deadline.

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
