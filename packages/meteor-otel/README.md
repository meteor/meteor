# meteor-otel

OpenTelemetry instrumentation for Meteor applications. This package provides automatic and manual tracing, metrics collection, and distributed tracing capabilities for Meteor apps.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Tracing Methods](#tracing-methods)
- [Tracing Publications](#tracing-publications)
- [Roundtrip Tracing](#roundtrip-tracing)
- [Custom Spans](#custom-spans)
- [Metrics](#metrics)
- [Integration with DDP](#integration-with-ddp)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Installation

Add the package to your Meteor application:

```bash
meteor add meteor-otel
```

## Quick Start

Initialize OpenTelemetry at the very beginning of your server startup (before other imports):

```javascript
// server/main.js
import { initOtel } from 'meteor/meteor-otel';

// Initialize FIRST, before other imports
initOtel({
  serviceName: 'my-meteor-app',
  resourceAttributes: {
    'deployment.environment': 'production',
    'service.version': '1.0.0',
  },
});

// Then your other imports
import { Meteor } from 'meteor/meteor';
import { LinksCollection } from '/imports/api/links';
// ...
```

## Configuration

### Environment Variables

The package uses standard OpenTelemetry environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Service name for telemetry | `meteor-app` |
| `OTEL_DEBUG` | Enable verbose logging (`1` to enable) | `0` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base OTLP endpoint | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Specific traces endpoint | `{base}/v1/traces` |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Specific metrics endpoint | `{base}/v1/metrics` |
| `OTEL_METRICS_EXPORT_INTERVAL_MS` | Metrics export interval | `1000` |
| `OTEL_HOST_METRICS_ENABLED` | Enable host metrics (`0` to disable) | `1` |
| `OTEL_RUNTIME_METRICS_ENABLED` | Enable Node.js runtime metrics (`0` to disable) | `1` |

### Programmatic Configuration

```javascript
import { initOtel } from 'meteor/meteor-otel';

initOtel({
  serviceName: 'my-app',
  resourceAttributes: {
    'deployment.environment': process.env.NODE_ENV,
    'service.namespace': 'my-company',
    'service.version': '2.0.0',
  },
  instrumentations: [
    // Add custom instrumentations here (see examples below)
  ],
});
```

### Custom Instrumentations

You can add OpenTelemetry instrumentations for popular libraries. Install them via npm and pass to `initOtel`:

```javascript
import { initOtel } from 'meteor/meteor-otel';

// Install these packages first:
// meteor npm install @opentelemetry/instrumentation-http
// meteor npm install @opentelemetry/instrumentation-express
// meteor npm install @opentelemetry/instrumentation-mongodb
// meteor npm install @opentelemetry/instrumentation-redis

import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';

initOtel({
  serviceName: 'my-meteor-app',
  resourceAttributes: {
    'deployment.environment': process.env.NODE_ENV,
  },
  instrumentations: [
    // HTTP instrumentation - traces all HTTP requests
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (request) => {
        // Ignore health check endpoints
        return request.url === '/health' || request.url === '/ready';
      },
      requestHook: (span, request) => {
        span.setAttribute('http.request.custom_header', request.headers['x-custom-header']);
      },
    }),

    // Express instrumentation - if using Express via webapp
    new ExpressInstrumentation({
      ignoreLayers: ['/health', '/metrics'],
    }),

    // MongoDB instrumentation - traces all MongoDB operations
    new MongoDBInstrumentation({
      enhancedDatabaseReporting: true, // Include query details
      responseHook: (span, response) => {
        span.setAttribute('db.response.count', response.result?.length || 0);
      },
    }),

    // Redis instrumentation - if using Redis for caching/sessions
    new RedisInstrumentation({
      dbStatementSerializer: (cmdName, cmdArgs) => {
        // Customize how Redis commands are logged
        return `${cmdName} ${cmdArgs[0] || ''}`;
      },
    }),
  ],
});
```

### Available Community Instrumentations

Here are some useful instrumentations you can add:

| Package | Description |
|---------|-------------|
| `@opentelemetry/instrumentation-http` | HTTP client and server requests |
| `@opentelemetry/instrumentation-express` | Express.js middleware |
| `@opentelemetry/instrumentation-mongodb` | MongoDB driver operations |
| `@opentelemetry/instrumentation-redis` | Redis client operations |
| `@opentelemetry/instrumentation-graphql` | GraphQL operations |
| `@opentelemetry/instrumentation-grpc` | gRPC client and server |
| `@opentelemetry/instrumentation-aws-sdk` | AWS SDK operations |
| `@opentelemetry/instrumentation-dns` | DNS lookups |
| `@opentelemetry/instrumentation-net` | Net module (TCP connections) |
| `@opentelemetry/instrumentation-fs` | File system operations |

### Example: MongoDB + HTTP Instrumentation

A common setup for Meteor apps using MongoDB:

```javascript
// server/otel-setup.js
import { initOtel } from 'meteor/meteor-otel';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';

export function setupTelemetry() {
  initOtel({
    serviceName: process.env.OTEL_SERVICE_NAME || 'meteor-app',
    resourceAttributes: {
      'deployment.environment': process.env.NODE_ENV || 'development',
      'service.version': process.env.APP_VERSION || '1.0.0',
    },
    instrumentations: [
      new HttpInstrumentation({
        // Don't trace sockjs polling requests (too noisy)
        ignoreIncomingRequestHook: (request) => {
          return request.url?.includes('/sockjs/');
        },
      }),
      new MongoDBInstrumentation({
        enhancedDatabaseReporting: true,
      }),
    ],
  });
}

// server/main.js
import { setupTelemetry } from './otel-setup';
setupTelemetry(); // Call FIRST before other imports

import { Meteor } from 'meteor/meteor';
// ... rest of your app
```

### Creating Your Own Instrumentation

For custom libraries or Meteor-specific code, you can create your own instrumentation:

```javascript
import { initOtel, getTracer } from 'meteor/meteor-otel';
import { trace, SpanKind } from '@opentelemetry/api';

// Initialize first
initOtel({ serviceName: 'my-app' });

// Create a custom instrumentation for an external API client
class MyApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.tracer = getTracer('my-api-client');
  }

  async fetchData(endpoint, params = {}) {
    const span = this.tracer.startSpan(`api.fetch ${endpoint}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.method': 'GET',
        'http.url': `${this.baseUrl}${endpoint}`,
        'api.endpoint': endpoint,
      },
    });

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      span.setAttribute('http.status_code', response.status);

      if (!response.ok) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${response.status}` });
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      span.setAttribute('api.response.items', data.length || 0);
      span.setStatus({ code: SpanStatusCode.OK });

      return data;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  }
}
```

## Tracing Methods

The simplest way to trace methods is using the built-in `otel` option in `Meteor.methods`:

```javascript
// Trace ALL methods in this block
Meteor.methods({
  'tasks.create'(data) {
    return TasksCollection.insertAsync(data);
  },
  'tasks.remove'(taskId) {
    return TasksCollection.removeAsync(taskId);
  },
}, { otel: true });

// Trace SPECIFIC methods only
Meteor.methods({
  'tasks.create'(data) {
    return TasksCollection.insertAsync(data);
  },
  'tasks.update'(taskId, data) {
    return TasksCollection.updateAsync(taskId, { $set: data });
  },
  'tasks.remove'(taskId) {
    return TasksCollection.removeAsync(taskId);
  },
}, { otel: ['tasks.create', 'tasks.remove'] }); // Only traces create and remove
```


### Captured Method Attributes

When a method is traced, the following attributes are automatically captured:

| Attribute | Description |
|-----------|-------------|
| `ddp.type` | Always `method` |
| `ddp.method.name` | Method name |
| `meteor.method.name` | Method name (alias) |
| `meteor.user.id` | User ID or `anonymous` |
| `user.id` | User ID or `anonymous` |
| `ddp.method.id` | DDP message ID |
| `ddp.method.params.length` | Number of parameters |
| `ddp.method.params.types` | Array of parameter types |
| `ddp.random_seed` | Random seed for this call |
| `ddp.session.id` | DDP session ID |
| `net.peer.ip` | Client IP address |
| `ddp.protocol.version` | DDP protocol version |
| `ddp.connection.url` | Connection URL |
| `ddp.session.user_id` | Session user ID |

## Tracing Publications

```javascript
// Trace a publication
Meteor.publish('tasks', function() {
  return TasksCollection.find({ userId: this.userId });
}, { otel: true });

// Named publication with otel tracing
Meteor.publish('tasks.byProject', function(projectId) {
  check(projectId, String);
  return TasksCollection.find({ projectId, userId: this.userId });
}, { otel: true });
```

### Captured Publication Attributes

| Attribute | Description |
|-----------|-------------|
| `ddp.type` | Always `publication` |
| `ddp.publication.name` | Publication name |
| `meteor.publication.name` | Publication name (alias) |
| `meteor.user.id` | User ID or `anonymous` |
| `user.id` | User ID or `anonymous` |
| `ddp.subscription.id` | Subscription ID |
| `ddp.subscription.handle` | Subscription handle |
| `ddp.subscription.params.length` | Number of parameters |
| `ddp.subscription.params.types` | Array of parameter types |
| `ddp.subscription.universal` | Boolean, true if universal subscription |
| `ddp.session.id` | DDP session ID |
| `net.peer.ip` | Client IP address |

## Adding Events and Attributes to Active Spans

When using `{ otel: true }`, you can add custom events and attributes to the automatically created span using helper functions. These are safe to call even when no span is active.

### Adding Events

Use `addEvent` to mark important points in your method/publication execution:

```javascript
import { addEvent } from 'meteor/meteor-otel';

Meteor.methods({
  async 'orders.process'(orderId) {
    addEvent('validation.start');
    await validateOrder(orderId);
    addEvent('validation.complete', { orderId });

    addEvent('payment.start');
    const result = await processPayment(orderId);
    addEvent('payment.complete', {
      paymentId: result.id,
      amount: result.amount
    });

    addEvent('notification.start');
    await sendConfirmationEmail(orderId);
    addEvent('notification.complete');

    return result;
  }
}, { otel: true });
```

### Adding Attributes

Use `setAttribute` or `setAttributes` to add custom attributes:

```javascript
import { setAttribute, setAttributes } from 'meteor/meteor-otel';

Meteor.methods({
  async 'tasks.create'(data) {
    // Single attribute
    setAttribute('task.priority', data.priority);
    setAttribute('task.category', data.category);

    // Or multiple attributes at once
    setAttributes({
      'task.priority': data.priority,
      'task.category': data.category,
      'task.assignee': data.assigneeId,
      'task.dueDate': data.dueDate?.toISOString(),
    });

    return await TasksCollection.insertAsync(data);
  }
}, { otel: true });
```

### Recording Exceptions

Use `recordException` to log errors without failing the span, or `setSpanError` to mark the span as failed:

```javascript
import { recordException, setSpanError, addEvent } from 'meteor/meteor-otel';

Meteor.methods({
  async 'data.sync'(sourceId) {
    const results = { success: 0, failed: 0 };

    for (const item of items) {
      try {
        await syncItem(item);
        results.success++;
      } catch (error) {
        // Record the error but continue processing
        recordException(error);
        addEvent('sync.item.failed', { itemId: item._id, error: error.message });
        results.failed++;
      }
    }

    // If too many failures, mark the span as error
    if (results.failed > results.success) {
      setSpanError(`Sync mostly failed: ${results.failed}/${results.success + results.failed}`);
    }

    return results;
  }
}, { otel: true });
```

### Creating Child Spans

Use `createChildSpan` to create sub-spans for tracking individual operations:

```javascript
import { createChildSpan, addEvent } from 'meteor/meteor-otel';

Meteor.methods({
  async 'orders.process'(orderId) {
    addEvent('order.processing.start');

    // Create a child span for payment processing
    const paymentSpan = createChildSpan('process.payment', {
      'order.id': orderId
    });

    try {
      paymentSpan.addEvent('payment.charge.start');
      const paymentResult = await chargeCustomer(orderId);
      paymentSpan.setAttribute('payment.id', paymentResult.id);
      paymentSpan.setAttribute('payment.amount', paymentResult.amount);
      paymentSpan.addEvent('payment.charge.complete');
      paymentSpan.end(); // Mark as successful
    } catch (error) {
      paymentSpan.fail(error); // Mark as failed
      throw error;
    }

    // Create another child span for shipping
    const shippingSpan = createChildSpan('process.shipping', {
      'order.id': orderId
    });

    try {
      const tracking = await createShipment(orderId);
      shippingSpan.setAttribute('shipping.tracking', tracking.number);
      shippingSpan.end();
    } catch (error) {
      shippingSpan.fail(error);
      throw error;
    }

    addEvent('order.processing.complete');
    return { success: true };
  }
}, { otel: true });
```

### Getting the Active Span Directly

For advanced use cases, you can get the raw OpenTelemetry span:

```javascript
import { getActiveSpan } from 'meteor/meteor-otel';

Meteor.methods({
  async 'tasks.create'(data) {
    const span = getActiveSpan();

    if (span) {
      // Access any OpenTelemetry span method
      span.updateName(`tasks.create:${data.type}`);
      span.addEvent('custom.event');

      // Get span context for propagation
      const spanContext = span.spanContext();
      console.log('Trace ID:', spanContext.traceId);
    }

    return await TasksCollection.insertAsync(data);
  }
}, { otel: true });
```

### API Summary

| Function | Description |
|----------|-------------|
| `getActiveSpan()` | Get the currently active span (or undefined) |
| `addEvent(name, attributes?)` | Add an event to the active span |
| `setAttribute(key, value)` | Set a single attribute on the active span |
| `setAttributes(attributes)` | Set multiple attributes on the active span |
| `recordException(error)` | Record an exception without failing the span |
| `setSpanError(messageOrError)` | Mark the span as failed with an error |
| `createChildSpan(name, attributes?)` | Create a child span linked to the current span |

## Roundtrip Tracing

Roundtrip tracing allows you to track an operation from method call all the way to when the DDP `added` message is sent to the client. This is useful for measuring the full latency a user experiences.

```javascript
import { createRoundtripTracer } from 'meteor/meteor-otel';
import { Random } from 'meteor/random';

// Create a tracer for your collection operations
const tasksTracer = createRoundtripTracer('tasks.roundtrip');

Meteor.methods({
  async 'tasks.create'(data) {
    // Begin a roundtrip span
    const roundtrip = tasksTracer.begin('tasks.create->publish', {
      'user.id': this.userId,
      'task.priority': data.priority,
    });

    // Generate ID before insert so we can track the document
    const doc = {
      _id: Random.id(),
      ...data,
      userId: this.userId,
      createdAt: new Date(),
    };

    // Tell the tracer which document to track
    roundtrip.trackDocument('tasks', doc._id);

    try {
      // Run the database operation within the span context
      await roundtrip.run(() => TasksCollection.insertAsync(doc));

      // The span will automatically end when the DDP 'added' message is sent
      return doc._id;
    } catch (error) {
      // Mark as failed if there's an error
      roundtrip.fail(error);
      throw error;
    }
  },
});
```

### Roundtrip API

#### `createRoundtripTracer(tracerName)`

Creates a new roundtrip tracer instance.

```javascript
const tracer = createRoundtripTracer('my-collection.roundtrip');
```

#### `tracer.begin(spanName, attributes?, timeoutMs?)`

Starts a new roundtrip span.

- `spanName`: Name for the span (e.g., `'tasks.create->publish'`)
- `attributes`: Optional initial span attributes
- `timeoutMs`: Timeout for waiting for DDP added message (default: 30000)

Returns a roundtrip handle with the following methods:

| Method | Description |
|--------|-------------|
| `trackDocument(collection, docId)` | Track a document to wait for its DDP 'added' message |
| `fail(error)` | Mark the roundtrip as failed |
| `run(fn)` | Run a function within the span context |
| `addEvent(name, attributes)` | Add an event to the span |
| `setAttribute(key, value)` | Set an attribute on the span |
| `end()` | End the span successfully without waiting for DDP |

### Advanced Roundtrip Example

```javascript
import { createRoundtripTracer } from 'meteor/meteor-otel';

const ordersTracer = createRoundtripTracer('orders.roundtrip');

Meteor.methods({
  async 'orders.create'(items, shippingAddress) {
    const roundtrip = ordersTracer.begin('orders.create->publish', {
      'user.id': this.userId,
      'order.items.count': items.length,
    });

    const orderId = Random.id();
    roundtrip.trackDocument('orders', orderId);

    try {
      // Add events for tracking progress
      roundtrip.addEvent('validation.start');
      validateItems(items);
      roundtrip.addEvent('validation.complete');

      roundtrip.addEvent('payment.start');
      const paymentResult = await processPayment(items, this.userId);
      roundtrip.setAttribute('payment.id', paymentResult.id);
      roundtrip.addEvent('payment.complete');

      // Insert within span context
      await roundtrip.run(async () => {
        await OrdersCollection.insertAsync({
          _id: orderId,
          items,
          shippingAddress,
          userId: this.userId,
          paymentId: paymentResult.id,
          status: 'confirmed',
          createdAt: new Date(),
        });
      });

      return orderId;
    } catch (error) {
      roundtrip.fail(error);
      throw error;
    }
  },
});
```

## Custom Spans

### Using `withSpan` (Async)

```javascript
import { withSpan } from 'meteor/meteor-otel';

async function processOrder(orderId) {
  return withSpan('orders', 'processOrder', async () => {
    const order = await OrdersCollection.findOneAsync(orderId);
    await validateOrder(order);
    await chargeCustomer(order);
    await sendConfirmation(order);
    return order;
  }, { 'order.id': orderId });
}
```

### Using `withSpanSync` (Synchronous)

```javascript
import { withSpanSync } from 'meteor/meteor-otel';

function calculateTax(amount, region) {
  return withSpanSync('tax', 'calculateTax', () => {
    const rate = getTaxRate(region);
    return amount * rate;
  }, { 'tax.region': region, 'tax.amount': amount });
}
```

### Using `createSpanBuilder` (Advanced Control)

```javascript
import { createSpanBuilder } from 'meteor/meteor-otel';

const builder = createSpanBuilder('my-service');

async function complexOperation(data) {
  const span = builder.start('complexOperation', {
    'input.size': data.length,
  });

  try {
    span.addEvent('step1.start');
    const result1 = await step1(data);
    span.addEvent('step1.complete', { 'result.count': result1.length });

    span.addEvent('step2.start');
    const result2 = await span.runAsync(() => step2(result1));
    span.setAttribute('step2.output.size', result2.length);

    span.success();
    return result2;
  } catch (error) {
    span.error(error);
    throw error;
  }
}
```

## Trace Propagation

Trace propagation allows you to continue traces across service boundaries, enabling distributed tracing. The package supports the W3C Trace Context standard.

### Injecting Context (Outgoing Requests)

When making requests to external services, inject the trace context into headers:

```javascript
import { injectTraceContext } from 'meteor/meteor-otel';

Meteor.methods({
  async 'orders.sync'(orderId) {
    // Get headers with current trace context
    const headers = injectTraceContext({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiToken()}`,
    });

    // External service receives traceparent and tracestate headers
    const response = await fetch('https://inventory.example.com/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId }),
    });

    return response.json();
  }
}, { otel: true });
```

### Extracting Context (Incoming Requests)

When receiving requests from external services, extract and use the trace context:

```javascript
import { extractTraceContext, withSpan, context } from 'meteor/meteor-otel';
import { WebApp } from 'meteor/webapp';

// In a webhook handler
WebApp.connectHandlers.use('/webhook/orders', async (req, res) => {
  // Extract trace context from incoming headers
  const parentContext = extractTraceContext(req.headers);

  // Run within the extracted context - spans will be children of the incoming trace
  await context.with(parentContext, async () => {
    await withSpan('webhook', 'processOrder', async () => {
      const body = await parseBody(req);
      await processOrderWebhook(body);
    });
  });

  res.writeHead(200);
  res.end('OK');
});
```

### Getting Trace Context for Non-HTTP Channels

Use `getTraceContext()` to get a serializable object for passing through queues, WebSockets, or DDP:

```javascript
import { getTraceContext } from 'meteor/meteor-otel';

Meteor.methods({
  async 'tasks.create'(data) {
    // Get current trace context as a simple object
    const traceContext = getTraceContext();
    // Returns: { traceparent: '00-abc123...', tracestate: 'vendor=value' }

    // Pass to a job queue
    await JobQueue.add('process-task', {
      data,
      traceContext, // Include for distributed tracing
    });

    return await TasksCollection.insertAsync(data);
  }
}, { otel: true });
```

### Restoring Context from Serialized Data

Use `createContextFromTrace()` to restore context from serialized trace data:

```javascript
import { createContextFromTrace, withSpan, context } from 'meteor/meteor-otel';

// In a job worker
async function processJob(job) {
  // Restore the trace context
  const parentContext = createContextFromTrace(job.traceContext);

  // All spans created inside will be children of the original trace
  await context.with(parentContext, async () => {
    await withSpan('worker', 'processJob', async () => {
      await doWork(job.data);
    });
  });
}
```

### Using `runWithTraceContext` (Shorthand)

Combines extracting and running in one call:

```javascript
import { runWithTraceContext, withSpan } from 'meteor/meteor-otel';

// Process a webhook with its trace context
WebApp.connectHandlers.use('/webhook', async (req, res) => {
  const result = await runWithTraceContext(req.headers, async () => {
    return await withSpan('webhook', 'process', async () => {
      return await processWebhook(req.body);
    });
  });

  res.end(JSON.stringify(result));
});

// Process a queued job
async function handleJob(job) {
  return runWithTraceContext(job.traceContext, async () => {
    return await withSpan('jobs', job.type, async () => {
      return await processJob(job);
    });
  });
}
```

### Creating Linked Spans (Batch Processing)

When processing multiple items from different traces, use `createLinkedSpan` to link without parenting:

```javascript
import { createLinkedSpan } from 'meteor/meteor-otel';

async function processBatch(orders) {
  // Each order may have come from a different trace
  const links = orders.map(order => order.traceContext).filter(Boolean);

  // Create a span that links to all original traces
  const batchSpan = createLinkedSpan('batch', 'processBatch', links, {
    'batch.size': orders.length,
  });

  try {
    for (const order of orders) {
      batchSpan.addEvent('processing.order', { orderId: order._id });
      await processOrder(order);
    }
    batchSpan.end();
  } catch (error) {
    batchSpan.fail(error);
    throw error;
  }
}
```

### Trace Propagation API Summary

| Function | Description |
|----------|-------------|
| `injectTraceContext(headers?)` | Inject current trace context into headers |
| `extractTraceContext(headers)` | Extract trace context from headers |
| `getTraceContext()` | Get trace context as serializable object |
| `createContextFromTrace(traceContext)` | Create context from serialized trace data |
| `runWithTraceContext(headers, fn)` | Extract context and run function in one call |
| `createLinkedSpan(tracer, name, links, attrs?)` | Create a span linked to multiple traces |

### W3C Trace Context Headers

The propagation uses the W3C Trace Context standard headers:

| Header | Description | Example |
|--------|-------------|---------|
| `traceparent` | Required. Contains trace-id, span-id, and flags | `00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01` |
| `tracestate` | Optional. Vendor-specific trace data | `congo=t61rcWkgMzE,rojo=00f067aa0ba902b7` |

### Example: Full Distributed Tracing Flow

```javascript
// Service A: Creates order and sends to Service B
import { injectTraceContext, addEvent } from 'meteor/meteor-otel';

Meteor.methods({
  async 'orders.create'(orderData) {
    addEvent('order.validating');
    validateOrder(orderData);
    addEvent('order.validated');

    // Save order locally
    const orderId = await OrdersCollection.insertAsync({
      ...orderData,
      status: 'pending',
    });

    // Send to inventory service with trace context
    addEvent('inventory.requesting');
    const headers = injectTraceContext({
      'Content-Type': 'application/json',
    });

    await fetch('https://inventory.example.com/reserve', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId, items: orderData.items }),
    });
    addEvent('inventory.requested');

    return orderId;
  }
}, { otel: true });

// Service B: Receives request and continues trace
import { runWithTraceContext, withSpan, addEvent } from 'meteor/meteor-otel';
import { WebApp } from 'meteor/webapp';

WebApp.connectHandlers.use('/reserve', async (req, res) => {
  await runWithTraceContext(req.headers, async () => {
    await withSpan('inventory', 'reserveItems', async () => {
      const { orderId, items } = JSON.parse(req.body);

      addEvent('inventory.checking');
      const available = await checkAvailability(items);
      addEvent('inventory.checked', { available });

      if (available) {
        addEvent('inventory.reserving');
        await reserveItems(orderId, items);
        addEvent('inventory.reserved');
      }

      res.writeHead(available ? 200 : 409);
      res.end(JSON.stringify({ available }));
    });
  });
});
```

This creates a connected trace across both services, allowing you to see the full request flow in your observability tool.

## Metrics

### Creating a Metrics Recorder

```javascript
import { createMetricsRecorder } from 'meteor/meteor-otel';

const appMetrics = createMetricsRecorder('my-app');

// Counter - for counting events
const ordersCounter = appMetrics.counter(
  'orders.created',
  'Number of orders created',
  'orders'
);

// Histogram - for measuring distributions
const latencyHistogram = appMetrics.histogram(
  'api.latency',
  'API request latency',
  'ms'
);

// UpDownCounter - for values that can increase or decrease
const activeUsers = appMetrics.upDownCounter(
  'users.active',
  'Number of active users',
  'users'
);

// Usage
ordersCounter.add(1, { 'order.type': 'subscription' });
latencyHistogram.record(150, { 'endpoint': '/api/orders' });
activeUsers.increment({ 'region': 'us-east' });
activeUsers.decrement({ 'region': 'us-west' });
```

### Observable Metrics

```javascript
const appMetrics = createMetricsRecorder('my-app');

// Observable Gauge - async value that's read periodically
appMetrics.observableGauge(
  'queue.size',
  'Current queue size',
  'items',
  () => jobQueue.length
);

// Observable Counter - async monotonic value
appMetrics.observableCounter(
  'requests.total',
  'Total requests processed',
  'requests',
  () => server.totalRequests
);

// With attributes
appMetrics.observableGauge(
  'connections.active',
  'Active connections by type',
  'connections',
  () => ({
    value: getActiveConnections(),
    attributes: { 'connection.type': 'websocket' }
  })
);
```

### Simple Metric Shortcuts

```javascript
import { simpleCounter, simpleHistogram, createTimer } from 'meteor/meteor-otel';

// Simple counter
const incrementOrders = simpleCounter('my-app', 'orders.created', 'Orders created');
incrementOrders(); // +1
incrementOrders(5); // +5
incrementOrders(1, { type: 'subscription' }); // +1 with attributes

// Simple histogram
const recordLatency = simpleHistogram('my-app', 'api.latency', 'API latency', 'ms');
recordLatency(150);
recordLatency(200, { endpoint: '/api/users' });

// Timer utility
const dbTimer = createTimer('my-app', 'db.query.duration', 'Database query duration');

// Manual timing
const timer = dbTimer.start({ 'db.operation': 'find' });
await collection.findAsync(query);
timer.end();

// Automatic timing
await dbTimer.time(async () => {
  await collection.findAsync(query);
}, { 'db.operation': 'find' });
```

## Integration with DDP

### How It Works

The `meteor-otel` package integrates with the DDP server at multiple levels:

1. **DDPServer._Session**: The package hooks into `DDPServer._Session.prototype.send` to intercept DDP messages and track when documents are sent to clients.

2. **MethodInvocation**: The `ddp-common` package's `MethodInvocation` class has been extended with internal properties (`_session`, `_messageId`) that provide tracing context.

3. **Automatic Instrumentation**: When using the `otel` option, the package automatically wraps method and publication handlers.

### DDP Instrumentation Details

```javascript
// The package installs hooks on DDPServer._Session
// This happens automatically when you use createRoundtripTracer

import { installDDPHooks } from 'meteor/meteor-otel';

// This is called automatically, but you can call it manually if needed
installDDPHooks();
```

### Connection Attributes Captured

The following connection information is automatically captured:

| Attribute | Description |
|-----------|-------------|
| `ddp.session.id` | Unique session identifier |
| `net.peer.ip` | Client IP address |
| `ddp.protocol.version` | DDP protocol version |
| `ddp.connection.url` | Socket URL |
| `ddp.session.user_id` | Logged-in user ID |
| `ddp.connection.header.user_agent` | User-Agent header |
| `ddp.connection.header.x_forwarded_for` | X-Forwarded-For header |
| `ddp.connection.header.x_real_ip` | X-Real-IP header |
| `ddp.connection.header.accept_language` | Accept-Language header |
| `ddp.connection.header.host` | Host header |

## API Reference

### Initialization

```javascript
import {
  initOtel,
  shutdown,
  getTracerProvider,
  getMeterProvider,
  getTracer,
  getMeter,
  getConfig,
} from 'meteor/meteor-otel';
```

| Function | Description |
|----------|-------------|
| `initOtel(options)` | Initialize OpenTelemetry providers |
| `shutdown()` | Gracefully shutdown providers |
| `getTracerProvider()` | Get the tracer provider instance |
| `getMeterProvider()` | Get the meter provider instance |
| `getTracer(name, version?)` | Get a tracer instance |
| `getMeter(name, version?)` | Get a meter instance |
| `getConfig()` | Get current configuration |

### DDP Instrumentation

```javascript
import {
  createRoundtripTracer,
  installDDPHooks,
  wrapMethod,
  wrapPublication,
  // Active span utilities
  getActiveSpan,
  addEvent,
  setAttribute,
  setAttributes,
  recordException,
  setSpanError,
  createChildSpan,
} from 'meteor/meteor-otel';
```

| Function | Description |
|----------|-------------|
| `createRoundtripTracer(name)` | Create a roundtrip tracer |
| `installDDPHooks()` | Install DDP message hooks |
| `wrapMethod(name, fn)` | Wrap a method with tracing |
| `wrapPublication(name, fn)` | Wrap a publication with tracing |
| `getActiveSpan()` | Get the currently active span |
| `addEvent(name, attrs?)` | Add event to active span |
| `setAttribute(key, value)` | Set attribute on active span |
| `setAttributes(attrs)` | Set multiple attributes on active span |
| `recordException(error)` | Record exception on active span |
| `setSpanError(msgOrErr)` | Mark active span as failed |
| `createChildSpan(name, attrs?)` | Create a child span |

### Tracing Utilities

```javascript
import {
  withSpan,
  withSpanSync,
  createSpanBuilder,
  // Trace propagation
  extractTraceContext,
  injectTraceContext,
  getTraceContext,
  createContextFromTrace,
  runWithTraceContext,
  createLinkedSpan,
} from 'meteor/meteor-otel';
```

| Function | Description |
|----------|-------------|
| `withSpan(tracer, span, fn, attrs?)` | Execute async function in span |
| `withSpanSync(tracer, span, fn, attrs?)` | Execute sync function in span |
| `createSpanBuilder(tracerName)` | Create a span builder |
| `extractTraceContext(headers)` | Extract trace context from headers |
| `injectTraceContext(headers?)` | Inject trace context into headers |
| `getTraceContext()` | Get trace context as serializable object |
| `createContextFromTrace(ctx)` | Create context from serialized trace |
| `runWithTraceContext(headers, fn)` | Run function with extracted context |
| `createLinkedSpan(tracer, name, links, attrs?)` | Create span linked to other traces |

### Metrics Utilities

```javascript
import {
  createMetricsRecorder,
  simpleCounter,
  simpleHistogram,
  createTimer,
} from 'meteor/meteor-otel';
```

| Function | Description |
|----------|-------------|
| `createMetricsRecorder(name)` | Create a metrics recorder |
| `simpleCounter(meter, name, desc)` | Create a simple counter function |
| `simpleHistogram(meter, name, desc, unit)` | Create a simple histogram function |
| `createTimer(meter, name, desc)` | Create a timer utility |

### Re-exported OpenTelemetry API

```javascript
import {
  trace,
  metrics,
  context,
  SpanStatusCode,
} from 'meteor/meteor-otel';
```

## Performance Considerations

OpenTelemetry adds instrumentation overhead to your application. While generally minimal, it's important to understand the performance implications and how to mitigate them.

### Overhead Estimates

| Operation | Typical Overhead | Notes |
|-----------|-----------------|-------|
| Span creation | ~1-5 μs | Per span, minimal impact |
| Attribute addition | ~0.1-0.5 μs | Per attribute |
| Event recording | ~0.5-1 μs | Per event |
| Context propagation | ~2-10 μs | Per inject/extract |
| OTLP export (batch) | ~1-5 ms | Per batch, async |
| Memory per span | ~1-2 KB | Depends on attributes |

### Expected Performance Impact

In typical production scenarios:

| Scenario | Expected Overhead | Recommendation |
|----------|------------------|----------------|
| Light tracing (methods only) | 0.1-0.5% CPU | Safe for all environments |
| Full tracing + metrics | 1-3% CPU | Monitor in production |
| High-cardinality attributes | 3-5% CPU | Avoid in hot paths |
| Debug mode enabled | 5-10% CPU | Development only |

### Memory Considerations

```javascript
// Memory usage factors:
// - Each active span: ~1-2 KB
// - Pending spans (roundtrip): ~2-3 KB each
// - Metric aggregations: ~100 bytes per unique label set
// - Export buffers: Configurable, default ~5 MB

// Example: 1000 concurrent requests with full tracing
// Estimated memory overhead: 2-5 MB
```

### Minimizing Performance Impact

#### 1. Use Sampling in Production

For high-traffic applications, sample traces instead of capturing everything:

```javascript
import { initOtel } from 'meteor/meteor-otel';

initOtel({
  serviceName: 'my-app',
  // Add custom sampler configuration via environment
  // OTEL_TRACES_SAMPLER=parentbased_traceidratio
  // OTEL_TRACES_SAMPLER_ARG=0.1  (10% sampling)
});
```

```bash
# Sample 10% of traces in production
OTEL_TRACES_SAMPLER=parentbased_traceidratio \
OTEL_TRACES_SAMPLER_ARG=0.1 \
meteor
```

#### 2. Reduce Metrics Export Frequency

```bash
# Default: 1000ms (1 second) - can cause overhead
# Recommended for production: 10000-30000ms
OTEL_METRICS_EXPORT_INTERVAL_MS=15000 meteor
```

#### 3. Disable Expensive Instrumentations

```bash
# Disable host metrics (CPU, memory monitoring)
OTEL_HOST_METRICS_ENABLED=0 meteor

# Disable runtime metrics (Node.js internals)
OTEL_RUNTIME_METRICS_ENABLED=0 meteor
```

#### 4. Limit Attribute Cardinality

```javascript
// BAD - High cardinality (unique per request)
setAttribute('request.id', requestId);  // Creates many unique time series
setAttribute('user.email', user.email); // PII and high cardinality

// GOOD - Low cardinality (bounded set of values)
setAttribute('request.type', 'api');     // Limited set of types
setAttribute('user.plan', user.planType); // e.g., 'free', 'pro', 'enterprise'
```

#### 5. Avoid Tracing Hot Paths

```javascript
// BAD - Tracing every iteration
for (const item of largeArray) {
  const span = createChildSpan('process.item'); // 10,000 spans!
  processItem(item);
  span.end();
}

// GOOD - Trace the batch, add events for checkpoints
const batchSpan = createChildSpan('process.batch', {
  'batch.size': largeArray.length,
});
for (let i = 0; i < largeArray.length; i++) {
  processItem(largeArray[i]);
  if (i % 1000 === 0) {
    batchSpan.addEvent('progress', { processed: i });
  }
}
batchSpan.end();
```

#### 6. Use Selective Tracing

```javascript
// Only trace specific methods instead of all
Meteor.methods({
  'users.updateProfile'(data) { /* ... */ },
  'users.getSettings'(data) { /* ... */ },   // High frequency, skip
  'orders.create'(data) { /* ... */ },
  'orders.list'(data) { /* ... */ },          // High frequency, skip
}, {
  otel: ['users.updateProfile', 'orders.create'] // Only trace mutations
});
```

### Monitoring Telemetry Overhead

Use these metrics to monitor OpenTelemetry's own overhead:

```javascript
import { createMetricsRecorder } from 'meteor/meteor-otel';

const otelMetrics = createMetricsRecorder('otel.self');

// Track export latency
const exportLatency = otelMetrics.histogram(
  'otel.export.latency',
  'Time to export telemetry batch',
  'ms'
);

// Track dropped spans (if buffer overflows)
const droppedSpans = otelMetrics.counter(
  'otel.spans.dropped',
  'Number of spans dropped due to buffer overflow'
);
```

### Production Configuration Recommendations

```bash
# Recommended production environment variables
export OTEL_SERVICE_NAME="my-app"
export OTEL_EXPORTER_OTLP_ENDPOINT="https://collector.example.com:4318"

# Sampling: Capture 10% of traces
export OTEL_TRACES_SAMPLER="parentbased_traceidratio"
export OTEL_TRACES_SAMPLER_ARG="0.1"

# Reduce export frequency
export OTEL_METRICS_EXPORT_INTERVAL_MS="15000"

# Disable verbose instrumentations
export OTEL_HOST_METRICS_ENABLED="0"
export OTEL_RUNTIME_METRICS_ENABLED="0"

# Disable debug logging
export OTEL_DEBUG="0"
```

### When NOT to Use OpenTelemetry

Consider disabling or limiting telemetry in these scenarios:

| Scenario | Recommendation |
|----------|----------------|
| Resource-constrained environments | Disable or use aggressive sampling |
| Sub-millisecond latency requirements | Disable tracing in critical paths |
| High-frequency batch jobs | Sample or trace only summary |
| Development/testing (local) | Use debug mode, but disable in CI |
| Cost-sensitive cloud deployments | Sample to control data volume |

### Graceful Degradation

The package is designed to fail gracefully:

```javascript
// All helper functions are safe to call even without initialization
addEvent('my.event');        // No-op if no active span
setAttribute('key', 'value'); // No-op if no active span
getActiveSpan();             // Returns undefined if no span

// Trace propagation returns safe defaults
extractTraceContext(null);    // Returns active context
getTraceContext();           // Returns empty object if no span
```

### Comparing Overhead: With vs Without Telemetry

```javascript
// Benchmark example (simplified)
// Without telemetry: ~0.5ms per method call
// With full telemetry: ~0.6ms per method call (+20% relative, +0.1ms absolute)

// For most applications, this translates to:
// - API response time: 50ms → 50.5ms (negligible)
// - Throughput: ~1-3% reduction under load
// - Memory: +50-100MB for high-traffic apps
```

### Summary: Performance Best Practices

1. **Sample traces in production** - Don't capture 100% of requests
2. **Increase export intervals** - 15-30 seconds is usually sufficient
3. **Limit attribute cardinality** - Avoid unique values per request
4. **Disable unnecessary metrics** - Host/runtime metrics are optional
5. **Avoid hot path instrumentation** - Don't trace tight loops
6. **Monitor telemetry overhead** - Track export latency and dropped spans
7. **Use selective tracing** - Only instrument important operations

## Best Practices

### 1. Initialize Early

Always initialize OpenTelemetry before other imports:

```javascript
// GOOD - initialize first
import { initOtel } from 'meteor/meteor-otel';
initOtel({ serviceName: 'my-app' });

import { Meteor } from 'meteor/meteor';
// ... other imports

// BAD - initializing after other imports may miss early spans
import { Meteor } from 'meteor/meteor';
import { initOtel } from 'meteor/meteor-otel';
initOtel({ serviceName: 'my-app' });
```

### 2. Use Meaningful Span Names

```javascript
// GOOD - descriptive names
withSpan('orders', 'processPayment', async () => { ... });
tasksTracer.begin('tasks.create->publish', { ... });

// BAD - vague names
withSpan('service', 'doStuff', async () => { ... });
```

### 3. Add Relevant Attributes

```javascript
// GOOD - useful attributes for debugging
wrapMethod('orders.create', async function(items) {
  // The wrapper automatically captures userId, connection info, etc.
  // Add business-specific attributes in your roundtrip tracer
  const roundtrip = tracer.begin('orders.create', {
    'order.items.count': items.length,
    'order.total': calculateTotal(items),
  });
});

// BAD - no context
wrapMethod('orders.create', async function(items) {
  // No attributes = harder to debug
});
```

### 4. Handle Errors Properly

```javascript
// GOOD - errors are recorded and span ends properly
const roundtrip = tracer.begin('operation');
try {
  await roundtrip.run(() => riskyOperation());
} catch (error) {
  roundtrip.fail(error); // Records exception and sets error status
  throw error;
}

// BAD - span never ends on error
const roundtrip = tracer.begin('operation');
await roundtrip.run(() => riskyOperation()); // If this throws, span hangs
```

### 5. Use Appropriate Metric Types

```javascript
// Counter - for monotonically increasing values
const requestsCounter = metrics.counter('requests.total');

// Histogram - for distributions (latency, sizes)
const latencyHistogram = metrics.histogram('request.latency');

// UpDownCounter - for values that go up and down
const activeConnections = metrics.upDownCounter('connections.active');

// Observable Gauge - for point-in-time readings
metrics.observableGauge('cpu.usage', () => getCpuUsage());
```

### 6. Graceful Shutdown

```javascript
import { shutdown } from 'meteor/meteor-otel';

// Ensure telemetry is flushed on shutdown
process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});
```

## Troubleshooting

### No traces appearing

1. Check that `initOtel()` is called before other code:
   ```javascript
   import { initOtel } from 'meteor/meteor-otel';
   initOtel({ serviceName: 'my-app' });
   // THEN import other modules
   ```

2. Verify your OTLP endpoint is correct:
   ```bash
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 meteor
   ```

3. Enable debug logging:
   ```bash
   OTEL_DEBUG=1 meteor
   ```

### Roundtrip spans timing out

If roundtrip spans always end with timeout errors:

1. Ensure the document ID matches exactly:
   ```javascript
   const doc = { _id: Random.id(), ...data };
   roundtrip.trackDocument('collection', doc._id); // Must match inserted ID
   ```

2. Verify the collection name matches:
   ```javascript
   roundtrip.trackDocument('tasks', docId); // Must match published collection name
   ```

3. Check that the publication is active and sending the document

### Method traces missing context

If method traces don't have connection information:

1. Ensure you're using `wrapMethod` or the `otel` option correctly
2. Check that the method is being called via DDP (not server-side `Meteor.call`)

### High memory usage

If you notice high memory usage:

1. Check the metrics export interval:
   ```bash
   OTEL_METRICS_EXPORT_INTERVAL_MS=5000 meteor  # Export every 5s instead of 1s
   ```

2. Disable host/runtime metrics if not needed:
   ```bash
   OTEL_HOST_METRICS_ENABLED=0 OTEL_RUNTIME_METRICS_ENABLED=0 meteor
   ```

### Common Error Messages

| Error | Solution |
|-------|----------|
| `[meteor-otel] Already initialized` | `initOtel()` was called twice. Call it only once at startup. |
| `[meteor-otel] Not initialized. Call initOtel() first.` | You're using a function that requires initialization before `initOtel()` was called. |
| `[meteor-otel] DDPServer._Session not available` | The package was loaded before ddp-server. Check package dependencies. |

## Example: Complete Application

```javascript
// server/main.js
import { initOtel, createRoundtripTracer, createMetricsRecorder } from 'meteor/meteor-otel';

// Initialize OpenTelemetry FIRST
initOtel({
  serviceName: 'todo-app',
  resourceAttributes: {
    'deployment.environment': process.env.NODE_ENV || 'development',
  },
});

import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Random } from 'meteor/random';
import { TasksCollection } from '/imports/api/tasks';

// Create tracers and metrics
const tasksTracer = createRoundtripTracer('tasks.roundtrip');
const appMetrics = createMetricsRecorder('todo-app');
const tasksCreated = appMetrics.counter('tasks.created', 'Tasks created');
const tasksCompleted = appMetrics.counter('tasks.completed', 'Tasks completed');

// Methods with automatic tracing
Meteor.methods({
  async 'tasks.insert'(text) {
    check(text, String);

    if (!this.userId) {
      throw new Meteor.Error('Not authorized');
    }

    const roundtrip = tasksTracer.begin('tasks.insert->publish', {
      'user.id': this.userId,
    });

    const task = {
      _id: Random.id(),
      text,
      createdAt: new Date(),
      userId: this.userId,
      completed: false,
    };

    roundtrip.trackDocument('tasks', task._id);

    try {
      await roundtrip.run(() => TasksCollection.insertAsync(task));
      tasksCreated.add(1, { 'user.id': this.userId });
      return task._id;
    } catch (error) {
      roundtrip.fail(error);
      throw error;
    }
  },

  async 'tasks.setCompleted'(taskId, completed) {
    check(taskId, String);
    check(completed, Boolean);

    if (!this.userId) {
      throw new Meteor.Error('Not authorized');
    }

    await TasksCollection.updateAsync(taskId, {
      $set: { completed },
    });

    if (completed) {
      tasksCompleted.add(1, { 'user.id': this.userId });
    }
  },

  async 'tasks.remove'(taskId) {
    check(taskId, String);

    if (!this.userId) {
      throw new Meteor.Error('Not authorized');
    }

    await TasksCollection.removeAsync(taskId);
  },
}, { otel: true }); // Enable tracing for all methods

// Publications with automatic tracing
Meteor.publish('tasks', function() {
  if (!this.userId) {
    return this.ready();
  }
  return TasksCollection.find({ userId: this.userId });
}, { otel: true });

// Observable metrics for monitoring
appMetrics.observableGauge(
  'tasks.pending',
  'Number of pending tasks',
  'tasks',
  async () => {
    return await TasksCollection.find({ completed: false }).countAsync();
  }
);

// Graceful shutdown
import { shutdown } from 'meteor/meteor-otel';

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await shutdown();
  process.exit(0);
});
```

## License

MIT
