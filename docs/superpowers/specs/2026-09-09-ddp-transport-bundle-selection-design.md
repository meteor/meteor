# Build-time DDP transport selection

Status: approved
Date: 2026-09-09
Owners: Meteor core

## Goal

Allow production Meteor bundles to contain only the DDP transport they will
use, while keeping every existing application and package compatible by
default.

Today `ddp-server` owns both the `sockjs` and `uWebSockets.js` npm
dependencies, and `socket-stream-client` always imports the browser SockJS
implementation. Runtime configuration chooses one transport, but the bundle
still contains both implementations and all uWebSockets.js prebuilt binaries.

This change introduces structural package boundaries around the two
transports and an opt-in build setting:

```text
meteor build ../output --ddp-transport=sockjs
meteor build ../output --ddp-transport=uws
meteor build ../output --ddp-transport=both
```

`both` is the default. With no new option, package resolution, runtime
selection, bundle contents, and the ability to change transports through
settings or environment variables remain as they are today.

## Compatibility contract

This feature must not introduce a breaking change for Meteor developers.

- `meteor-base -> ddp -> ddp-server` remains unchanged.
- Applications do not add or remove packages to use the default behavior.
- `ddp-server` keeps its package name, public exports, settings, environment
  variables, and default SockJS behavior.
- `socket-stream-client` keeps its package name and public API.
- `Meteor.settings.packages['ddp-server'].transport`, `DDP_TRANSPORT`, and
  `DISABLE_SOCKJS` keep their current priority and meaning.
- Existing builds that omit `--ddp-transport` include both providers and can
  still switch transports at runtime.
- The new fixed-transport behavior is opt-in. An application that selects one
  transport accepts that changing to the omitted transport requires a rebuild.

The only new failure mode is intentional and limited to opt-in bundles: if
runtime configuration requests a transport that was not included at build
time, startup fails immediately with an actionable message instead of failing
later with a missing npm module or client connection error.

## Non-goals

- Changing the default DDP transport from SockJS to uWebSockets.js.
- Removing transport code or binaries from the Meteor checkout, dev bundle,
  package cache, or package download. This design optimizes the produced
  application bundle.
- Removing uWebSockets.js binaries for non-target operating systems or CPU
  architectures while retaining uWebSockets.js. That is a separate package
  installation optimization.
- Exposing arbitrary package exclusion as a public bundler feature.
- Letting applications register third-party DDP transports in this first
  change.
- Applying transport pruning to `meteor run`. Development remains a
  both-transport environment; production behavior can be exercised with
  `meteor build`.

## Package architecture

Three new internal core packages separate provider discovery from
transport-specific code and npm dependencies:

```text
ddp-server (public facade and shared server)
├── ddp-transport-registry
├── ddp-transport-sockjs
│   ├── server SockJS provider
│   ├── npm dependency: sockjs
│   └── browser SockJS implementation
└── ddp-transport-uws
    ├── server uWebSockets.js provider
    └── npm dependency: uWebSockets.js

socket-stream-client (public client facade)
├── ddp-transport-registry
└── ddp-transport-sockjs browser provider
```

### `ddp-transport-registry`

This small client-and-server package owns the internal provider registry. It
exports `DDPTransportRegistry`, with `register(name, provider)`, `get(name)`,
and `names()` operations. Client and server bundles have independent registry
instances, as they do for every Meteor package.

Both facades and both providers depend normally on this package. Providers
register themselves as their eager package code runs; facades query it only
when selecting a transport.

The separate registry is necessary because Meteor's linker emits static
`Package[...]` imports for every exported symbol of a strong dependency. The
transport provider packages intentionally export no symbols. They can
therefore remain strong dependencies for default inclusion and ordering while
being safely absent from a fixed-transport target. The registry itself is
never excluded.

### `ddp-transport-sockjs`

This package receives:

- `packages/ddp-server/transports/sockjs.js`, including the `/websocket`
  rewrite helper;
- the `sockjs` npm dependency currently declared by `ddp-server`;
- `packages/socket-stream-client/sockjs-1.6.1-min-.js`; and
- a small client provider that exposes the SockJS constructor to
  `socket-stream-client`.

Its eager server module registers the transport factory, and its eager client
module registers the SockJS constructor, in `DDPTransportRegistry`. The
package exports no symbols, so consumers cannot acquire a linker-generated
static import to the provider.

The transport's focused tests move with the implementation. Its package test
continues to cover malformed URLs and `/websocket` rewriting.

### `ddp-transport-uws`

This server-only package receives:

- `packages/ddp-server/transports/uws.js`; and
- the `uWebSockets.js` npm dependency currently declared by `ddp-server`.

Its eager server module registers the uWS transport factory in
`DDPTransportRegistry`. The package exports no symbols. Its focused
listen-option and transport tests move with the implementation.

### `ddp-server`

`ddp-server` remains the server facade. It keeps shared connection handling,
DDP sessions, compression support, and all npm dependencies used by those
shared paths. Only `sockjs` and `uWebSockets.js` move out.

It declares normal, strong server dependencies on both provider packages.
Strong dependencies are important for compatibility: normal package solving
and all builds without the new option still load both providers exactly as
they do today.

The transport resolver reads available providers from
`DDPTransportRegistry`. It does not statically import either provider.
Consequently, the bundler can omit a provider unibuild without leaving an
unresolved JavaScript import in `ddp-server`.

### `socket-stream-client`

`socket-stream-client` declares a normal, strong client dependency on
`ddp-transport-sockjs`, preserving today's default inclusion. It replaces the
static import of the minified SockJS file with a lookup in
`DDPTransportRegistry`.

When runtime config says `sockjs`, the client obtains the constructor from the
provider. For `uws`, it continues to use the browser's native `WebSocket` and
never needs SockJS. A missing SockJS provider produces an explicit error; in a
valid fixed uWS build that branch is never selected because the server has
already published `DDP_TRANSPORT=uws`.

`DDPTransportRegistry` is an implementation detail, not a supported public
API. All three new packages have documentation disabled.

## CLI and build options

`meteor build` and `meteor deploy` accept:

```text
--ddp-transport=sockjs|uws|both
```

The command layer validates the value before starting a build. Invalid values
fail with the supplied value, the three valid choices, and the command help
hint. Omission normalizes to `both`.

The normalized value is passed to the bundler as
`buildOptions.ddpTransport`. The hidden `meteor bundle` command inherits the
option through the shared build command definition.

For `meteor deploy --cache-build`, the normalized transport selection becomes
part of the cached build metadata and validity check. A cached bundle created
for a different DDP transport must not be reused even when the Git commit is
the same. Older cache records without this field are invalidated once and
rebuilt with complete metadata.

## Controlled package exclusion

The bundler translates the validated transport selection into an internal set
of provider packages to exclude:

| Selection | Excluded package |
|-----------|------------------|
| `both` | none |
| `sockjs` | `ddp-transport-uws` |
| `uws` | `ddp-transport-sockjs` |

The exclusion set is passed to every server and client target. Target load
ordering skips matching provider unibuilds while walking the dependency graph,
before compiler plugins, linking, client minification, npm directory
collection, and bundle writing.

This placement is essential:

- a SockJS-only server never collects or copies the uWebSockets.js npm tree,
  so none of its prebuilt binaries enter the bundle;
- a uWS-only client never compiles or minifies the SockJS browser source; and
- manifests and `usedPackages` describe the code that is actually present.

The implementation accepts package exclusions only as an internal target
option. The CLI does not accept package names, and the mapping is limited to
the two known DDP providers. This avoids creating a general mechanism that
could silently violate arbitrary strong package dependencies.

Provider versions can remain in `.meteor/versions`, because dependency solving
is deliberately unchanged for compatibility. The optimization boundary is the
output bundle, not the resolver or local package cache.

## Runtime resolution and errors

Runtime selection retains the existing priority:

1. `Meteor.settings.packages['ddp-server'].transport`
2. `DDP_TRANSPORT`
3. `DISABLE_SOCKJS` selecting `uws`
4. `sockjs`

After resolving the name, `ddp-server` compares it with the providers that are
actually present.

- An unknown name reports that the DDP transport is unknown and lists the
  supported names.
- A supported but omitted name reports that it was not included in this
  bundle, lists the included providers, and instructs the operator to rebuild
  with `--ddp-transport=<name>` or `--ddp-transport=both`.
- A present provider is initialized exactly as it is today, and its name is
  written to `__meteor_runtime_config__.DDP_TRANSPORT` for the browser.

Example mismatch:

```text
DDP transport "uws" is not included in this application bundle.
Included transports: sockjs. Rebuild with --ddp-transport=uws or
--ddp-transport=both.
```

This also makes legacy `DISABLE_SOCKJS=1` safe: it behaves unchanged in a
default bundle, selects uWS in a uWS-only bundle, and gives the same clear
mismatch error in a SockJS-only bundle.

## Build data flow

```text
meteor build --ddp-transport=uws
        |
        v
CLI validates and normalizes "uws"
        |
        v
buildOptions.ddpTransport = "uws"
        |
        v
bundler maps selection -> exclude ddp-transport-sockjs
        |
        +-----------------------------+
        |                             |
        v                             v
server target                    client targets
skip SockJS unibuild             skip SockJS unibuild
no sockjs npm tree               no minified SockJS source
retain uWS provider              retain native WebSocket path
        |                             |
        +--------------+--------------+
                       v
                 application bundle
```

The `both` path produces an empty exclusion set and therefore follows the
existing dependency graph without special removal.

## Alternatives considered

### Delete files after bundle creation

This mirrors application-specific scripts such as Wekan's uWS pruning and is a
useful short-term workaround. It is not the core solution because it depends on
private output paths, can leave manifest references behind, and does not
cleanly prevent browser SockJS from being compiled into a minified client
asset.

### Make both provider dependencies weak

Weak dependencies would allow omission naturally, but would also stop the
resolver and target graph from including providers by default. Restoring the
current behavior would require injecting provider roots in every build, run,
test, isopacket, and tool context. That creates more compatibility risk than a
small, controlled exclusion at target construction.

### Require applications to add a transport package

This is structurally simple but breaks every existing application and package
that expects `ddp-server` to be complete. It violates the compatibility goal.

### Keep both implementations in `ddp-server` and filter npm directories only

This could remove uWS binaries from SockJS builds, but it would not remove
unused server transport code or the browser SockJS implementation. It also
leaves the package ownership problem unresolved.

## Testing strategy

### Package tests

- Move SockJS-specific unit tests into `ddp-transport-sockjs`.
- Move uWS-specific unit tests into `ddp-transport-uws`.
- Keep shared raw-WebSocket and DDP integration tests in `ddp-server`.
- Test provider discovery for both present providers.
- Test the mismatch error for a supported but omitted provider.
- Preserve tests for settings, `DDP_TRANSPORT`, `DISABLE_SOCKJS`, and default
  priority.
- Test that the client only looks up SockJS when runtime config selects it.

### Bundler and CLI tests

Build a small fixture application in all three modes and inspect its output:

| Mode | Server SockJS | Server uWS/npm binaries | Client SockJS |
|------|---------------|-------------------------|---------------|
| default / `both` | present | present | present |
| `sockjs` | present | absent | present |
| `uws` | absent | present | absent |

Assertions use bundle manifests and package npm directories instead of only
comparing total size. Size is informative but too unstable for correctness.

Additional coverage verifies:

- invalid CLI values fail before bundling;
- `meteor deploy` forwards the normalized option;
- cached deploy builds are invalidated when the transport changes; and
- a default invocation is identical to explicit `both` for provider
  inclusion.

### Verification commands

The implementation is complete only after the relevant focused tests and the
repository unit suite pass. At minimum:

```text
./packages/test-in-console/run.sh "ddp-transport-sockjs"
./packages/test-in-console/run.sh "ddp-transport-uws"
./packages/test-in-console/run.sh "ddp-server"
./packages/test-in-console/run.sh "socket-stream-client"
npm run test:unit
```

A manual fixture build for `sockjs`, `uws`, and `both` additionally records the
server/client manifests and confirms the expected npm directories and uWS
binaries are absent or present.

## Rollout

The change ships in one Meteor release with `both` as the default. Release
notes document the optional flag and the rebuild requirement for fixed bundles.
No migration or upgrader is required.

Applications that want today's flexibility do nothing. Applications that know
their production transport can opt in independently:

```text
# traditional SockJS, without uWS native binaries
meteor build ../output --ddp-transport=sockjs

# uWebSockets.js, without server or browser SockJS
meteor build ../output --ddp-transport=uws
```

The build flag controls contents; the existing runtime setting controls which
included provider starts. A uWS-only artifact must also be deployed with its
existing runtime selection set to `uws`, for example through `DDP_TRANSPORT` or
Meteor settings. Keeping the two choices separate preserves current runtime
configuration semantics.
