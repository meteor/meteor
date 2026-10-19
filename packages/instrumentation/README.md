# instrumentation
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/instrumentation) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/instrumentation)
***

A read-only, best-effort stream of lifecycle events for the three server-side
primitives of a Meteor app — methods, publications, and DDP connections —
without patching Meteor's internals. It is the supported foundation that
observability tools (OpenTelemetry adapters, APMs, custom logging) build on.

```js
import { Instrumentation } from 'meteor/instrumentation';

Instrumentation.on('method.end', (event) => {
  console.log(`${event.name} took ${event.durationMs}ms`, event.traceId);
});
```

Events: `method.start` / `method.end` / `method.error`,
`publication.start` / `publication.ready` / `publication.stop` / `publication.error`,
`ddp.connection.open` / `ddp.connection.close`.

Payloads are bounded and redacted by default: arguments and results are only
included as bounded previews when explicitly opted in, and the Accounts methods
that carry credentials or tokens are always fully redacted.

See the [full API documentation](https://docs.meteor.com/api/instrumentation)
for `Instrumentation.configure`, per-method capture policies, and the complete
event reference.
