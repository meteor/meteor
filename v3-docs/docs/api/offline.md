# Offline

Keep a web app usable without network: the documents your publications sent
stay on the device, and the calls to the Methods you allow wait there until the
server has answered them. Reloads, airplane mode, a flaky connection: the app
opens with its data and sends what is pending once the connection is back.

The server stays the source of truth. Nothing is fetched beyond what your
publications already send, there is no sync query, and a rejected call is
reverted exactly like any failed Method call.

To use it, add the `offline` package to your project. The `meteor create --pwa`
skeleton ships with it.

```bash
meteor add offline
```

All the API lives on the client-only `Offline` export:

```js
import { Offline } from 'meteor/offline';
```

## Starting

Call `Offline.start` once, at client startup, before the first subscription:

```js
import { Links } from '/imports/api/links/links.js';
import '/imports/api/links/methods.js';

Offline.start({ collections: [Links], methods: ['links.insert'] });
Meteor.subscribe('links');
```

- `collections`: the collections whose Minimongo contents are kept on the device
  and loaded back on the next start.
- `methods`: the names of the Methods whose calls are recorded until the server
  answers.

On start, the connection is held back, the copy is loaded into Minimongo, the
recorded calls are issued again through Meteor (their stubs put the optimistic
documents back), then the connection goes through and the first data from the
server replaces the copy in one batch, the way a reconnection does. `start`
returns a promise that resolves once the copy is in Minimongo; waiting for it
is optional.

### The copy follows the subscriptions

On the first data from the server, the documents that the current
subscriptions do not publish leave Minimongo and the copy, as on any
reconnection. To keep a set of documents on the device, keep its subscription
active for the whole session rather than tied to a route: a board kept offline
is a board whose subscription stays up.

Without network the subscriptions do not become ready. Render from the
collections rather than from a subscription's `ready()`,
`Template.subscriptionsReady` or `useSubscribe`: the documents are in Minimongo
as soon as `start` has resolved, and the `ready` event says so.

## Recorded calls

A recorded call goes through Meteor as usual: the stub runs at once, Meteor
keeps the call in its own queue while the connection is down and sends it on
reconnect. The record only has to survive a page reload: it is written when the
call is made and removed when the server answers. On the next start, the
recorded calls are issued again, oldest first.

A rejected call stays recorded with the server's error, and the stub's writes
are reverted by Meteor, as for any failed call.

```js
const waiting = await Offline.pending();
// [{ id, name, args, queuedAt, status: 'pending' }]
const rejected = await Offline.failed();
// same, with status: 'failed' and error: { error, reason, message }
await Offline.drop(id);
// forgets the record; a call this page already handed to Meteor is not
// cancelled and is still sent on reconnect
```

### Listed Methods must be idempotent

Meteor re-sends a call that was sent but never answered, and so does this
package after a reload. A listed Method has to be safe to run twice: generate
the `_id` on the client and insert only when absent, prefer `$set` to `$inc`.

```js
Meteor.methods({
  async 'links.insert'({ _id, title, url }) {
    check(_id, String);
    await Links.upsertAsync({ _id }, { $setOnInsert: { title, url, createdAt: new Date() } });
  },
});
```

## Events

`Offline.on` registers a listener and returns a handle with a `stop()` method.
Each event carries its `type`.

```js
Offline.on('method.failed', ({ name, error }) => {
  notify(`${name} was rejected: ${error.reason}`);
});
```

| Event | Fires when | Payload |
| --- | --- | --- |
| `method.queued` | a call to a listed Method has been recorded | `id`, `name` |
| `method.done` | the server answered without error; the record is gone | `id`, `name` |
| `method.failed` | the server rejected the call; the record is kept with its error | `id`, `name`, `error` |
| `method.dropped` | the app dropped a record | `id` |
| `ready` | the copy is loaded and the recorded calls are queued, on start and on user change | `userId`, `calls`, `documents` |

## One copy per user

The copy belongs to the user it was published to: one database per
`Meteor.userId()`, deleted when that user logs out or another one logs in.
Without a known session when the app starts offline, there is no copy. Nothing
that was not published to the user is ever kept.

`Offline.clear()` empties the current user's copy, documents and recorded calls.

## Limits

- Documents only. Files belong on the server or in a service worker cache.
- One tab replays the recorded calls; two tabs of the same app replay them twice.
- `wait` and the other `Meteor.apply` options are not kept for the replay.
- `drop` forgets a record; it does not cancel a call this page already handed
  to Meteor.
- The copy lives in IndexedDB, under the browser's storage quota and without
  encryption: data that must not sit on a shared device stays out of the list.
