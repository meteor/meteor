
# Environment Variables
List of environment variables that you can use with your Meteor application.


## BIND_IP
(_production_)

Bind the application server to a specific network interface by IP address, for example: `BIND_IP=192.168.0.2`.

See also: [`PORT`](#port).

> In development, this can be accomplished with `meteor run --port a.b.c.d:port`.

## DDP_DEFAULT_CONNECTION_URL
(_develoment, production_)

There are some situations where it is valuable for the meteor client to use a different DDP server than the `ROOT_URL` server.

Setting `DDP_DEFAULT_CONNECTION_URL` when running a meteor server (development: `meteor run` or production: `node main.js`) will set the DDP server to the value in `DDP_DEFAULT_CONNECTION_URL`.

Setting `DDP_DEFAULT_CONNECTION_URL` when building (`meteor build`)  will define the DDP server for `cordova` builds.

## DDP_TRANSPORT
(_development, production_)

Select the WebSocket transport backend for DDP connections. Available transports:

| Value | Description |
|---|---|
| `sockjs` | (default) SockJS with HTTP polling fallback. Maximum compatibility. |
| `uws` | [uWebSockets.js](https://github.com/uNetworking/uWebSockets.js/) — raw WebSocket, no polling fallback. Lower latency and higher throughput. |

```bash
# Use uWebSockets.js
DDP_TRANSPORT=uws meteor run

# Explicitly use SockJS (default)
DDP_TRANSPORT=sockjs meteor run
```

You can also configure the transport via your `settings.json` file:
```json
{
  "packages": {
    "ddp-server": {
      "transport": "uws"
    }
  }
}
```

When using `uws`, the client automatically uses native WebSocket instead of the SockJS client protocol.

::: warning
The `uws` transport uses raw WebSocket without HTTP polling fallback. Clients behind proxies that block WebSocket connections will not be able to connect. Make sure your deployment environment supports WebSocket before switching.
If you are using a load balancer (such as NGINX, HAProxy, or AWS ALB), ensure it is configured to upgrade HTTP connections to WebSocket and that stickiness (session affinity) is not required since `uws` does not use polling.
:::

See also: [`DISABLE_SOCKJS`](#disable-sockjs).

## METEOR_REACTIVITY_ORDER
(_development, production_)

Meteor configures data reactivity mechanism priorities using this variable. Starting in Meteor 3.5, the default is `changeStreams,oplog,polling` — Change Streams are enabled automatically, with `oplog` and `polling` as fallbacks in that order. You only need to set this variable (or the equivalent `settings.json` entry) when you want to **override** that default — for example, to force `oplog`:

```bash
# Force oplog (with polling as fallback) instead of the default change streams
METEOR_REACTIVITY_ORDER="oplog,polling" meteor run
```

This can also be configured via your `settings.json` file:
```json
{
  "packages": {
    "mongo": {
      "reactivity": ["oplog", "polling"]
    }
  }
}
```

## DISABLE_WEBSOCKETS
(_development, production_)

In the event that your own deployment platform does not support WebSockets, or you are confident that you will not benefit from them, setting this variable with `DISABLE_WEBSOCKETS=1` will explicitly disable WebSockets and forcibly resort to the fallback polling-mechanism, instead of trying to detect this automatically.

## DISABLE_SOCKJS
(_development, production_)

Set `DISABLE_SOCKJS=1` to use raw WebSocket instead of SockJS. This is equivalent to `DDP_TRANSPORT=uws` and is kept for backward compatibility. 

::: tip
*Migration Note:* `DISABLE_SOCKJS=1` is deprecated. Prefer using [`DDP_TRANSPORT=uws`](#ddp-transport) or configuring `"transport": "uws"` in your `settings.json` file. `DDP_TRANSPORT` is more explicit and establishes a foundation for future transport backend additions.
:::

## DO_NOT_TRACK
(_development, production_)

Meteor automatically sends usage statistics about which Meteor packages your app uses by default. This behavior can be disabled by setting `DO_NOT_TRACK` to any truthy value (for example, `DO_NOT_TRACK=1`).

Having this variable set globally (say, by adding it to your `.bashrc` file) would disable statistics for all Meteor projects in your computer, and do the same for other programs that respect this flag (like [FerretDB](https://www.ferretdb.com/) or [Bun](https://bun.sh/)).

Alternatively, you can install the `package-stats-opt-out` package by calling `meteor add package-stats-opt-out` inside your Meteor project folder. Having this package installed in your project disables usage statistics being sent to the Meteor project, regardless of whether the `DO_NOT_TRACK` environment variable is set or not.

## HTTP_FORWARDED_COUNT
(_production_)

Set this to however many number of proxies you have running before your Meteor application. For example, if have an NGINX server acting as a proxy before your Meteor application, you would set `HTTP_FORWARDED_COUNT=1`. If you have a load balancer in front of that NGINX server, the count is 2.

## MAIL_URL
(_development, production_)

Use this variable to set the SMTP server for sending e-mails.  [Postmark](https://www.postmarkapp.com), [Mandrill](https://www.mandrillapp.com), [MailGun](https://www.mailgun.com) and [SendGrid](https://www.sendgrid.com) (among others) are companies who can provide this service.  The `MAIL_URL` contains all of the information for connecting to the SMTP server and, like a URL, should look like `smtp://user:pass@yourservice.com:587` or `smtps://user:pass@yourservice.com:465`.

The `smtp://` form is for mail servers which support encryption via `STARTTLS` or those that do not use encryption at all and is most common for servers on port 587 and _sometimes_ port 25.  On the other hand, the `smtps://` form (the `s` stands for "secure") should be used if the server only supports TLS/SSL (and does not support connection upgrade with `STARTTLS`) and is most common for servers on port 465.

## METEOR_DISABLE_OPTIMISTIC_CACHING
(_production_)

When running `meteor build` or `meteor deploy` you can set `METEOR_DISABLE_OPTIMISTIC_CACHING=1` to speed up your build time.

Since optimistic in-memory caching is one of the more memory-intensive parts of the build system, setting the environment variable `METEOR_DISABLE_OPTIMISTIC_CACHING=1` can help improve memory usage during meteor build, which seems to improve the total build times. This configuration is perfectly safe because the whole point of optimistic caching is to keep track of previous results for future rebuilds, but in the case of meteor `build` or `deploy` there's only ever one initial build, so the extra bookkeeping is unnecessary.

## METEOR_IGNORE
(_development_)

An alternative way to exclude files and directories from the Meteor bundler, working similarly to a [`.meteorignore`](../about/modern-build-stack/meteor-bundler-optimizations.md#meteorignore) file but configured through an environment variable. This is useful when you want to ignore certain paths without modifying your project files.

The value should be a space-delimited list of patterns (following the same syntax as `.meteorignore`), for example: `METEOR_IGNORE="tests/* private/drafts"`.

When both `METEOR_IGNORE` and a `.meteorignore` file are present, their patterns are combined, so you can use the environment variable to complement your existing `.meteorignore` rules.

An interesting use case is to define different `METEOR_IGNORE` patterns per command. Since the variable is set per process, you can tailor what the bundler sees depending on whether you are running the app or running tests:

```bash
# When developing, ignore test folders to speed up rebuilds
METEOR_IGNORE="tests" meteor run

# When testing, ignore folders only needed for the running app
# e.g. public/ assets that are not consumed by tests
METEOR_IGNORE="public" meteor test --driver-package meteor/meteortesting:mocha
```

You can also exclude heavy `node_modules` sub-dependencies that are only relevant to one workflow. For example, ignore test-only packages when running the app, or ignore app-only packages when running tests:

```bash
# Ignore test-only dependencies when running the app
METEOR_IGNORE="node_modules/puppeteer node_modules/playwright-core" meteor run

# Ignore heavy app-only dependencies when running tests
METEOR_IGNORE="node_modules/pdfkit node_modules/sharp" meteor test --driver-package meteor/meteortesting:mocha
```

This way each command only processes the files it actually needs, reducing build times on both workflows without requiring changes to your project's `.meteorignore` file.

::: info
`METEOR_IGNORE` is automatically set when using the [Rspack bundler integration](../about/modern-build-stack/rspack-bundler-integration.md). Since Rspack handles the client and server app bundling, Meteor's bundler should only worry about what it strictly needs for the Meteor-Rspack integration. By using `METEOR_IGNORE` to exclude folders and dependencies that Rspack already manages or that are irrelevant to Meteor's side of the build, you ensure the most speed is gained from the Rspack delegation.
:::

## METEOR_LOCAL_DIR
(_development_)

This environment variable allows you to change the location of the `.meteor/local` directory, which Meteor uses to store its build cache and other local state. This is useful for running multiple instances of the same app with different local states or for redirecting the local directory to a different drive or path.

When using the [Rspack bundler integration](../about/modern-build-stack/rspack-bundler-integration.md), `METEOR_LOCAL_DIR` also influences the Rspack build context. It extracts the name of the folder represented in the path and appends it as a suffix to the following Rspack constants:
- `RSPACK_BUILD_CONTEXT`
- `RSPACK_CHUNKS_CONTEXT`
- `RSPACK_ASSETS_CONTEXT`

For example, if `METEOR_LOCAL_DIR` is set to `/path/to/.meteor/local-custom`, Rspack will use `_build-local-custom`, `build-chunks-local-custom`, and `build-assets-local-custom` as its context directories, ensuring that build artifacts remain isolated for that specific local environment.

For more information, see the [Running Multiple Instances](../about/modern-build-stack/rspack-bundler-integration.md#running-multiple-instances) section in the Rspack documentation.

## METEOR_PROFILE
(_development_)

In development, you may need to diagnose what has made builds start taking a long time. To get the callstack and times during builds, you can run `METEOR_PROFILE=1 meteor`.

## METEOR_PACKAGE_DIRS
(_development, production_)

Colon-delimited list of local package directories to look in, outside your normal application structure, for example: `METEOR_PACKAGE_DIRS="/usr/local/my_packages/"`. Note that this used to be `PACKAGE_DIRS` but was changed in Meteor 1.4.2.

## METEOR_SETTINGS
(_production_)

When running your bundled application in production mode, pass a string of JSON containing your settings with `METEOR_SETTINGS='{ "server_only_setting": "foo", "public": { "client_and_server_setting": "bar" } }'`.

> In development, this is accomplished with `meteor --settings [file.json]` in order to provide full-reactivity when changing settings.  Those settings are simply passed as a string here. Please see the [Meteor.settings](../api/meteor#Meteor-settings) documentation for further information.

## METEOR_SQLITE_JOURNAL_MODE
(_development_)

The Meteor package catalog uses the `WAL` [SQLite Journal Mode](https://www.sqlite.org/pragma.html#pragma_journal_mode) by default.  The Journal mode for the package catalog can be modifed by setting `METEOR_SQLITE_JOURNAL_MODE`.

When running multiple concurrent meteor servers on [Windows Subsystem for Linux (WSL)](https://docs.microsoft.com/en-us/windows/wsl/) some meteor developers have seen issues with the package catalog.  Setting the environment variable `METEOR_SQLITE_JOURNAL_MODE=TRUNCATE` can overcome the issue.

## MONGO_OPLOG_URL
(_development, production_)

MongoDB server oplog URL. If you're using a replica set (which you should), construct this url like so: `MONGO_OPLOG_URL="mongodb://user:password@myserver.com:10139/local?replicaSet=(your replica set)&authSource=(your auth source)"`

## MONGO_URL
(_development, production_)

MongoDB server URL. Give a fully qualified URL (or comma-separated list of URLs) like `MONGO_URL="mongodb://user:password@myserver.com:10139"`. For more information see the [MongoDB docs](https://docs.mongodb.com/manual/reference/connection-string/).

## PORT
(_production_)

Which port the app should listen on, for example: `PORT=3030`

See also: [`BIND_IP`](#bind-ip).

> In development, this can be accomplished with `meteor run --port <port>`.

## ROOT_URL
(_development, production_)

Used to generate URLs to your application by, among others, the accounts package. Provide a full URL to your application like this: `ROOT_URL="https://www.myapp.com"`.

## TOOL_NODE_FLAGS
(_development, production_)

Used to pass Node.js flags that Meteor will inherit and spread to other tool processes like Rspack. For example, to increase memory limits for all tools: `TOOL_NODE_FLAGS="--max-old-space-size=4096"`

By default, these flags are automatically spread to `NODE_OPTIONS` so that tools like Rspack inherit them. This behavior can be controlled using [`TOOL_NODE_FLAGS_INHERIT`](#tool-node-flags-spread).

For full list of available flags see the [Node documentation](https://nodejs.org/dist/latest-v12.x/docs/api/cli.html).

## TOOL_NODE_FLAGS_INHERIT
(_development, production_)

Controls whether `TOOL_NODE_FLAGS` are prepended to `NODE_OPTIONS`. Enabled by default.

```bash
# Disable inheritance - Rspack won't inherit the heap limit
TOOL_NODE_FLAGS_INHERIT=0 TOOL_NODE_FLAGS="--max-old-space-size=4096" meteor run
```

## UNIX_SOCKET_GROUP
(_production_)

This overrides the default UNIX group of the socket file configured in `UNIX_SOCKET_PATH`. It can be set to a group name or a numerical gid.

## UNIX_SOCKET_NO_WORKER_SUFFIX
(_production_)

When running under the Node.js `cluster` module, each worker process normally has a worker-specific suffix appended to its socket file name (see [`UNIX_SOCKET_PATH`](#unix-socket-path)). Set `UNIX_SOCKET_NO_WORKER_SUFFIX=1` to disable this and have a worker use `UNIX_SOCKET_PATH` exactly as given. Use this when the forking process assigns each worker its own unique socket path directly, via the environment object passed to `cluster.fork()`:

```js
if (cluster.isPrimary) {
  ['worker1', 'worker2'].forEach((name) => {
    cluster.fork({
      UNIX_SOCKET_PATH: `/tmp/meteor.${name}.sock`,
      UNIX_SOCKET_NO_WORKER_SUFFIX: '1',
    });
  });
}
```

When enabling this, make sure each worker really does receive a unique path: workers sharing one socket path will delete and recreate each other's socket file.

## UNIX_SOCKET_PATH
(_production_)

Configure Meteor's HTTP server to listen on a UNIX socket file path (e.g. `UNIX_SOCKET_PATH=/tmp/meteor.sock`) instead of a TCP port. This is useful when running a local reverse proxy server like Nginx to handle client HTTP requests and direct them to your Meteor application. Leveraging UNIX domain sockets for local communication on the same host avoids the Operating System overhead required by TCP based communication and can also improve security. This UNIX socket file is created when Meteor starts and removed when Meteor exits.

When the server is a [Node.js `cluster`](https://nodejs.org/api/cluster.html) worker process, a worker-specific suffix is appended to the socket file name so that each worker (each of which is an independent Meteor server with its own in-memory session state) listens on its own socket file. The suffix is taken from the worker's `name` environment variable if set (e.g. `cluster.fork({ name: 'worker1' })` produces `/tmp/meteor.sock.worker1.sock`), otherwise from the worker's cluster id (e.g. `/tmp/meteor.sock.1.sock`). Note that cluster ids increment every time a worker is respawned, so set `name` if an external process such as a reverse proxy needs a stable socket file name. To disable the suffix entirely, see [`UNIX_SOCKET_NO_WORKER_SUFFIX`](#unix-socket-no-worker-suffix).

## UNIX_SOCKET_PERMISSIONS
(_production_)

This overrides the default UNIX file permissions on the UNIX socket file configured in `UNIX_SOCKET_PATH`. For example, `UNIX_SOCKET_PERMISSIONS=660` would set read/write permissions for both the user and group.
