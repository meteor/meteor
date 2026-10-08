# OpenTelemetry review changes

PR #14086 now targets Meteor 3.6 and consumes `meteor/instrumentation`.
The DDP core files match `release-3.6`: no `_Session` export, invocation fields,
prototype patching, handler wrapping, or `{ otel }` registration option is needed.

## Review disposition

| Review comments | Resolution |
| --- | --- |
| 2705921026, 2705921172, 3150512906, 3155463491, 3155463503 | Removed the document roundtrip implementation and its ID queues/timers. The public seam has no document-send event. The lifecycle observer instead bounds pending spans by capacity and timeout, handles late events, and cleans up on disconnect/shutdown. |
| 2705921077 | Removed `HeaderCarrier` and custom propagation helpers; applications use the standard OTel propagation API. |
| 2705921089 | No parameter values/types are read. Automatic spans retain only the argument count supplied by the public event. |
| 2705921111 | Retained batch span processor options and environment configuration. Added configuration regression coverage. |
| 2705921120, 2705921214 | Removed the PR's `ddp-common`/`ddp-server` changes. Previously registered handlers are observed when invoked after initialization. |
| 2705921138, 2705921241, 3155463464, 3155463537 | Updated initialization guidance and a real Custom Instrumentations section. App import ordering does not promise early HTTP/MongoDB patching; lifecycle observation does not depend on it. |
| 2705921158, 2730016754 | No headers, IPs, args/results, or user IDs are exported automatically. The optional attributes callback receives only public, policy-filtered events. Global capture policy is unchanged. |
| 2705921193 | Publication spans follow start/ready/stop/error events, including async setup; readiness is nonterminal. |
| 2730030040 | Removed generic span-builder, active-span, propagation, and metrics helpers. Native OTel examples leave error messages and metric conventions to the app. `getInvocationSpan` is the Meteor-specific correlation API. |
| 3155463510 | Obsolete tracing helper tests removed; new package tests and Node failure-path tests cover the supported integration. |
| 3155463515 | Replaced `withSpan` examples with native OTel `startActiveSpan` and explicit invocation parenting. |
| 3155463527, 3155463533 | Pinned infrastructure links to a verified commit, used descriptive link text, and removed visible TODO placeholders. |

Previously resolved comments remain covered by the new design: no object-form
registration ambiguity, no document queue overwrites, actual `traceparent`
assertions, defined example results, positive finite export intervals, correct
metric scope/name documentation, matching span names, and no undeclared Loki
provisioning.

## Validation

The package suite uses real Meteor method calls, DDP subscriptions, in-memory OTel
exporters, and a local HTTP collector. It covers concurrency, sanitized failures,
metrics, filtering, explicit parentage, capacity/timeout cleanup, provider
initialization, shutdown, and OTLP export. Isolated Node tests additionally cover
provider initialization failures and cleanup when a plugin throws.

The read-only lifecycle seam cannot activate an OTel context around a handler or
observe client receipt of DDP documents. These limits and migration steps are
explicit in the README and performance documentation.
