# Dev Server

Meteor Dev Server provides real-time file watching during development, with fast feedback through HMR, bundle visualizers, debug tools, Mongo built-in instance, CLI tools and more. At runtime, it offers a complete server environment supporting SSR and modern Express-based APIs.

As part of the modern build stack, we update each component for improved performance, smarter tooling, and better bundle observability and debugging. While Meteor Dev Server remains at the core, we’ll integrate modern tools and a new bundler to enhance your app development.

## Watcher

:::info
Starting with Meteor 3.3
:::

> The watcher listens for changes in your app’s code files and triggers quick recompilations.

New apps use a modern, cross-platform watcher: [`@parcel/watcher`](https://github.com/parcel-bundler/watcher). It responds quickly to file changes using native file watching. Symbolic link changes and all traversed files are supported via polling.

For existing apps, enable this by adding to `package.json`:

```json
"meteor": {
  "modern": true
}
```

If you run into issues with the new watcher, you can revert to the previous implementation for better file change detection. To disable the new watcher, set `"watcher": false` in your package.json.

```json
"meteor": {
  "modern": {
    "watcher": false
  }
}
```

The modern watcher uses the OS's native file watching with a performance-first approach. Both modern and legacy watchers support environment variables for polling, useful in edge cases like WSL with host, volumes, or remote setups.

To enable polling, run your Meteor app with:

```shell
# enable polling
METEOR_WATCH_FORCE_POLLING=true meteor run

# set polling interval (in ms)
METEOR_WATCH_POLLING_INTERVAL_MS=1000 METEOR_WATCH_FORCE_POLLING=true meteor run
```

> Polling uses more CPU and RAM, but it's the most reliable option in some environments.
