---
title: Advanced Features
description: Manual spans and metrics using the OpenTelemetry API
---

# Advanced Features

After [initializing telemetry](./otel-instrumentation.md), use the standard
OpenTelemetry API for custom spans and metrics. `meteor-otel` re-exports the API
so application code uses the same provider registry as the package.

## Manual child spans

The Meteor observer is read-only: it does not change the active OpenTelemetry
context of a handler. `getInvocationSpan()` looks up the span associated with the
current Meteor invocation, including across `await`. Explicitly use that span as
the parent when instrumenting application operations:

```js
import {
  context, trace, getTracer, getInvocationSpan, SpanStatusCode,
} from 'meteor/meteor-otel';

const tracer = getTracer('orders');

export async function processPayment(order, charge) {
  const invocation = getInvocationSpan();
  const parent = trace.getSpan(context.active()) || invocation;
  const parentContext = parent
    ? trace.setSpan(context.active(), parent)
    : context.active();

  return tracer.startActiveSpan('processPayment', {
    attributes: { 'payment.amount': order.total },
  }, parentContext, async span => {
    try {
      const result = await charge(order);
      span.addEvent('payment.completed');
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

`getInvocationSpan()` returns undefined outside an observed method/publication,
for filtered invocations, and after a span ends or times out. Native child spans
created within the explicit active context inherit that context normally. The
observer does not automatically parent nested Meteor invocations or propagate
trace headers through DDP; there is no transport context in the lifecycle API.

For HTTP or messaging protocols you control, use `propagation.inject()` and
`propagation.extract()` from the OTel API. Do not use Meteor's event correlation
IDs as W3C `traceparent` values.

## Business metrics

```js
import { getMeter } from 'meteor/meteor-otel';

const meter = getMeter('orders');
const created = meter.createCounter('orders.created', {
  description: 'Number of orders created',
});
const latency = meter.createHistogram('orders.processing.duration', {
  description: 'Order processing duration',
  unit: 'ms',
});

export async function processOrder(process) {
  const started = performance.now();
  try {
    const result = await process();
    created.add(1, { channel: 'web' });
    return result;
  } finally {
    latency.record(performance.now() - started, { channel: 'web' });
  }
}
```

`orders` is the instrumentation scope (meter name); `orders.created` and
`orders.processing.duration` are metric names. Keep labels bounded: use categories
such as channel or outcome, rather than order, user, or connection IDs. Prometheus
may normalize dots and add unit/type suffixes; inspect exported names before
writing dashboard queries.

## Span enrichment

```js
import { getInvocationSpan } from 'meteor/meteor-otel';

// Inside a Meteor method or publication:
getInvocationSpan()?.addEvent('validation.completed');
getInvocationSpan()?.setAttribute('app.workflow', 'checkout');
```

Only export application data you intend to retain. Automatic spans use sanitized
lifecycle errors and omit arguments, results, headers, IPs and user IDs; manually
recorded attributes and exceptions are under application control.
