# Offline

The `offline` package keeps two things on the device, in IndexedDB: a copy of
the documents your publications sent, for the collections you list, and the
calls to the Methods you list, until the server has answered them. The app
opens with its data without network and sends what is pending once the
connection is back.

## Installation

```bash
meteor add offline
```

The package is client-only. Start it once, at client startup, before the first
subscription:

```js
import { Offline } from 'meteor/offline';
import { Links } from '/imports/api/links/links.js';

Offline.start({ collections: [Links], methods: ['links.insert'] });
```

The `meteor create --pwa` skeleton ships with it and shows a links list that
works offline.

See the [Offline API](../api/offline.md) for the recorded calls, the events and
the requirements on the listed Methods.
