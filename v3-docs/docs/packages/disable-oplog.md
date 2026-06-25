# disable-oplog

`disable-oplog` turns off MongoDB **oplog tailing** for your Meteor app. When the package is present, Meteor's live-data layer stops using the oplog to observe changes and falls back to polling the database instead.

```bash
meteor add disable-oplog
```

## Usage

**Adding the package is all you need to do — there is nothing to configure.** `disable-oplog` exposes no JavaScript API and reads no settings; its mere presence disables oplog tailing app-wide. To re-enable oplog tailing, remove the package (`meteor remove disable-oplog`).

## How it works

The `disable-oplog` package contains no code of its own. Its presence is detected by Meteor's MongoDB integration — verified by the `package.js` comment: *"This package is empty; its presence is detected by mongo-livedata."* When the package is added, oplog-based change observation is disabled globally for the app; there is no API to call.

## When you might use it

Disabling the oplog can be useful in environments where oplog tailing is unavailable or undesirable — for example, when your MongoDB deployment does not expose an oplog, or when you want every reactive query to use polling instead. Because polling is generally less efficient than oplog tailing for high-throughput reactive workloads, only add this package when you specifically need to disable the oplog.

> This package is described in its `package.js` and `README.md` as an internal Meteor package. It is documented here because it is added directly to apps (`meteor add disable-oplog`) and has an observable, app-wide effect. It exposes no public JavaScript API.
