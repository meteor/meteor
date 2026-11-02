# offline

Keeps two things on the device, in IndexedDB, so a web app keeps working across
reloads and offline periods: a copy of the documents your publications sent, for
the collections you list, and the calls to the Methods you list, until the
server has answered them.

```js
import { Offline } from 'meteor/offline';
import { Links } from '/imports/api/links/links.js';

Offline.start({ collections: [Links], methods: ['links.insert'] });
```

Call `start` once, at client startup, before subscribing. It holds the
connection back, loads the copy into Minimongo, re-issues the recorded calls and
then lets the connection through, so the first data from the server replaces the
copy in one batch, exactly as a reconnection does. The server stays the source
of truth: nothing is fetched beyond what your publications already send, and
there is no sync query.

The copy follows the subscriptions of the session. On the first data from the
server, the documents the current subscriptions do not publish leave Minimongo
and the copy, as on any reconnection: to keep a set of documents on the device,
keep its subscription active for the whole session rather than tied to a route.
A subscription made while the connection is down is ready as soon as the copy
is in Minimongo, as long as the copy holds documents, and stays ready once the
server's data has replaced the copy; on a first start, with nothing on the
device, it waits for the server as usual.

A recorded call goes through Meteor as usual: its stub writes the optimistic
document, Meteor keeps the call in its own queue while the connection is down
and sends it on reconnect. The record only has to survive a page reload: it is
written when the call is made and removed when the server answers. A rejected
call stays in the record with the server's error, the stub's writes are
reverted by Meteor as for any failed call, and the app is told.

```js
Offline.on('method.failed', ({ name, error }) => notify(`${name}: ${error.reason}`));
const waiting = await Offline.pending(); // [{ id, name, args, queuedAt, status }]
const rejected = await Offline.failed(); // same, plus error
await Offline.drop(id);                  // forget one record
await Offline.clear();                   // empty the current user's copy
```

Events: `method.queued`, `method.done`, `method.failed`, `method.dropped` and
`ready` (the copy is loaded; `calls` and `documents` carry the counts).

The copy belongs to one user: a database per `Meteor.userId()`, deleted when
that user logs out or another one logs in. Nothing that was not published to
the user is ever kept.

Listed Methods must be idempotent. Meteor re-sends a call that was sent but
never answered, and so does this package after a reload: generate the `_id` on
the client and insert only if absent, prefer `$set` to `$inc`.

Limits of this version: documents only, not files; one tab replays the
recorded calls, two tabs of the same app replay them twice; `wait` and the
other `Meteor.apply` options are not kept for the replay; `drop` forgets a
record but does not cancel a call this page already handed to Meteor, which is
still sent on reconnect.
