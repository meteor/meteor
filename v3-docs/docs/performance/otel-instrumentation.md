---
title: Basic Instrumentation
description: Install and configure meteor-otel for automatic tracing of methods and publications
---

# Basic Instrumentation

In the [Infrastructure Setup](./otel-infrastructure.md), we set up the complete observability infrastructure: OpenTelemetry Collector, Tempo for traces, Prometheus for metrics, and Grafana for visualization. Now it's time to instrument your Meteor application to start generating telemetry data.

## What We Built So Far

We deployed an observability stack that's ready to receive telemetry:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Your Observability Stack                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌─────────────┐     ┌──────────────┐     ┌──────────────┐        │
│   │   Grafana   │────▶│    Tempo     │     │  Prometheus  │        │
│   │  :3000      │     │   (traces)   │     │  (metrics)   │        │
│   └─────────────┘     └──────────────┘     └──────────────┘        │
│          │                   ▲                    ▲                 │
│          │                   │                    │                 │
│          ▼                   │                    │                 │
│   ┌──────────────────────────┴────────────────────┘                │
│   │            OpenTelemetry Collector :4318                       │
│   └────────────────────────────▲───────────────────                │
│                                │                                    │
└────────────────────────────────┼────────────────────────────────────┘
                                 │
                    Waiting for telemetry data...
```

The infrastructure is listening on port `4318` (OTLP HTTP), ready to receive:
- **Traces** - Will be stored in Tempo
- **Metrics** - Will be stored in Prometheus
- **Logs** - Can be added later

But right now, nothing is sending data. Let's change that.

## Introducing meteor-otel

**meteor-otel** is a Meteor package that provides seamless OpenTelemetry integration for Meteor applications. It was designed with Meteor's unique architecture in mind, handling:

- **DDP Protocol**: Meteor's real-time data protocol doesn't use traditional HTTP requests, so standard Node.js instrumentation doesn't capture method calls or publications
- **Method and Publication Tracing**: Automatic instrumentation for Meteor.methods and Meteor.publish
- **MongoDB Integration**: Traces database operations as child spans

### What meteor-otel Provides

The package offers several levels of instrumentation:

| Feature | What It Does | When to Use |
|---------|--------------|-------------|
| `initOtel()` | Initializes OpenTelemetry, starts exporting **host metrics** (CPU, memory, event loop) | Always - this is the foundation |
| `{ otel: true }` | Enables **automatic tracing** for methods and publications | When you want to see method/publication traces |
| `withSpan()` | Creates **custom spans** within your code | When you need to trace specific operations |
| `addEvent()` | Adds **events** to the current span | When you want to mark important moments |
| `createMetricsRecorder()` | Creates **custom metrics** (counters, histograms, gauges) | When you need business metrics |
| `createRoundtripTracer()` | Traces **client-to-server roundtrips** | When debugging latency issues |

### Understanding the Instrumentation Flow

It's important to understand what each step enables:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Instrumentation Levels                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Step 1: initOtel()                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ✅ Host metrics (CPU, memory, event loop lag)                   │   │
│  │  ✅ Runtime metrics (GC, heap)                                   │   │
│  │  ✅ Connection to OTel Collector established                     │   │
│  │  ❌ No traces yet                                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  Step 2: { otel: true } on methods/publications                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ✅ Automatic traces for methods                                 │   │
│  │  ✅ Automatic traces for publications                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  Step 3: Custom instrumentation (withSpan, addEvent, metrics)           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ✅ Custom spans for specific operations                         │   │
│  │  ✅ Events marking important moments                             │   │
│  │  ✅ Business metrics (counters, histograms, gauges)              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### What You'll Learn

By the end of this tutorial, you'll know how to:

1. **Install and configure** the meteor-otel package
2. **Initialize OpenTelemetry** and see host metrics in Grafana
3. **Enable automatic tracing** for your methods and publications

### Prerequisites

Before continuing, make sure you have:

- [ ] Completed [Infrastructure Setup](./otel-infrastructure.md) (infrastructure running)
- [ ] A Meteor application (we'll use a simple example)
- [ ] Basic understanding of Meteor methods and publications
- [ ] Docker and Docker Compose installed

Let's start by installing the package and making that first connection to the collector.

## Installation and Initial Configuration

### Installing the Package

First, add the `meteor-otel` package to your Meteor application:

```bash
meteor add meteor-otel
```

This package includes all the necessary OpenTelemetry dependencies and auto-instrumentation for MongoDB operations.

### Configuring Environment Variables

Before initializing OpenTelemetry, you need to tell your application where to send telemetry data. Create or update your environment variables:

```bash
# Required: Where to send telemetry (your OTel Collector)
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318" #default for local setup

# Optional but recommended: Service identification
export OTEL_SERVICE_NAME="my-meteor-app" #default for local setup
export OTEL_SERVICE_VERSION="1.0.0" #default for local setup
export DEPLOYMENT_ENV="development" #default for local setup
```

For development with Docker Compose, you can add these to your `docker-compose.yaml` or a `.env` file:

```yaml
# In docker-compose.yaml, under your Meteor app service:
environment:
  - OTEL_EXPORTER_OTLP_ENDPOINT=http://opentelemetry-collector:4318
  - OTEL_SERVICE_NAME=my-meteor-app
  - DEPLOYMENT_ENV=development
```

### Initializing OpenTelemetry

The most critical aspect of OpenTelemetry initialization is **timing**. `initOtel()` must run **before any module you want auto-instrumented** is loaded — that includes Meteor itself and any npm dependency you import. Because ECMAScript module imports inside a single file are hoisted, you cannot safely place `initOtel()` "above" sibling `import` statements in `server/main.js`. Use a dedicated bootstrap file instead, and import that file as the very first statement of your entrypoint.

Create `server/otel-bootstrap.js`:

```javascript
// server/otel-bootstrap.js
// Single-purpose module: load and call initOtel() before anything else.
import os from 'node:os';
import { initOtel } from 'meteor/meteor-otel';

initOtel({
  serviceName: process.env.OTEL_SERVICE_NAME || 'my-meteor-app',
  resourceAttributes: {
    'deployment.environment': process.env.DEPLOYMENT_ENV || 'development',
    'service.version': process.env.OTEL_SERVICE_VERSION || '1.0.0',
    'service.instance.id': `${os.hostname()}-${process.pid}`,
  }
});
```

Then make `server/main.js` import the bootstrap file first:

```javascript
// server/main.js
// IMPORTANT: this import must be FIRST so OTel is initialized before any
// other module (Meteor core, your app code, npm deps) is loaded.
import './otel-bootstrap.js';

// Now the rest of your server can be imported normally.
import { Meteor } from 'meteor/meteor';
import { MyCollection } from '/imports/api/collections';
// ... other imports
```

### Understanding initOtel Options

The `initOtel()` function accepts a configuration object:

```javascript
initOtel({
  // Required: Identifies your service in traces and metrics
  serviceName: 'my-meteor-app',

  // Optional: Additional attributes attached to all telemetry
  resourceAttributes: {
    'deployment.environment': 'production',
    'service.version': '2.1.0',
    'service.instance.id': 'pod-abc123',
    'service.namespace': 'my-team',
    // Add any custom attributes you need
    'team.name': 'backend',
    'region': 'us-east-1',
  }
});
```

| Option | Type | Description |
|--------|------|-------------|
| `serviceName` | string | **Required**. Identifies your service in all telemetry data |
| `resourceAttributes` | object | Additional attributes attached to all spans and metrics |

Common resource attributes you might want to include:

| Attribute | Example | Purpose |
|-----------|---------|---------|
| `deployment.environment` | `production`, `staging`, `dev` | Filter telemetry by environment |
| `service.version` | `1.2.3` | Track which version generated the telemetry |
| `service.instance.id` | `pod-xyz-123` | Identify specific instances in scaled deployments |
| `service.namespace` | `checkout-team` | Group services by team or domain |

### What Happens After initOtel()

Once `initOtel()` is called, several things happen automatically:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    After calling initOtel()                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ✅ Connection established to OTel Collector                        │
│                                                                     │
│  ✅ Host metrics start exporting:                                   │
│     • process.cpu.time                                              │
│     • process.memory.usage                                          │
│     • nodejs.eventloop.lag                                          │
│     • nodejs.gc.duration                                            │
│     • nodejs.heap.size                                              │
│                                                                     │
│  ❌ No traces yet - methods and publications not instrumented       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

// TODO: add images

### Verifying the Connection

Start your Meteor application and check that telemetry is being received:

1. **Check the OTel Collector logs**:

```bash
docker compose logs -f opentelemetry-collector
```

You should see messages indicating metrics are being received.

2. **Check Prometheus for metrics**:

Open `http://localhost:9090` and query for your service's metrics:

```promql
# Check if host metrics are arriving
process_cpu_time_seconds_total{service_name="my-meteor-app"}

# Or search for any metric with your service name
{service_name="my-meteor-app"}
```

3. **Check Grafana**:

Open `http://localhost:3000`, go to **Explore**, select **Prometheus**, and run the same queries.

### A Complete Minimal Example

Here's a complete minimal setup. **`initOtel()` must run before any other module is loaded**, so it lives in its own bootstrap file that `server/main.js` imports first.

```javascript
// server/otel-bootstrap.js
import os from 'node:os';
import { initOtel } from 'meteor/meteor-otel';

initOtel({
  serviceName: process.env.OTEL_SERVICE_NAME || 'meteor-app',
  resourceAttributes: {
    'deployment.environment': process.env.DEPLOYMENT_ENV || 'development',
    'service.version': process.env.npm_package_version || '0.0.0',
    'service.instance.id': `${os.hostname()}-${process.pid}`,
  }
});
```

```javascript
// server/main.js

// Step 1: bootstrap OTel BEFORE everything else
import './otel-bootstrap.js';

// Step 2: now the rest of the server is loaded with OTel already running
import { Meteor } from 'meteor/meteor';
import { LinksCollection } from '/imports/api/links';

// Step 3: Define your methods and publications (no tracing yet)
Meteor.startup(async () => {
  console.log('Server started with OpenTelemetry initialized');

  // Publications
  Meteor.publish('links', function () {
    return LinksCollection.find();
  });

  // Methods
  Meteor.methods({
    'links.insert'(data) {
      return LinksCollection.insertAsync(data);
    },
    'links.remove'(id) {
      return LinksCollection.removeAsync(id);
    },
  });
});
```

At this point, you have:
- ✅ OpenTelemetry initialized
- ✅ Host metrics being exported to Prometheus
- ❌ **No traces yet** for methods and publications

In the next section, we'll enable automatic tracing for methods and publications using the `{ otel: true }` option.

## Enabling Automatic Tracing for Methods

Now that OpenTelemetry is initialized and sending metrics, let's enable automatic tracing for Meteor methods. This is where you'll start seeing traces in Grafana.

### The `{ otel: true }` Option

To enable tracing for methods, simply add `{ otel: true }` as the second argument to `Meteor.methods()`:

```javascript
// With tracing enabled
Meteor.methods({
  'links.insert'(data) {
    return LinksCollection.insertAsync(data);
  },
}, { otel: true });  // ← Add this!
```

That's it! With this single option, every method call will automatically:

1. **Create a span** with the method name (e.g., `meteor.method links.insert`)
2. **Record the duration** of the method execution
3. **Capture errors** if the method throws an exception

### What Gets Traced Automatically

When `{ otel: true }` is enabled, each method call generates a trace with the following structure:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Trace: meteor.method links.insert                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Span: meteor.method links.insert                                │   │
│  │ Duration: 45ms                                                  │   │
│  │ Attributes:                                                     │   │
│  │   • meteor.method.name: "links.insert"                          │   │
│  │   • meteor.userId: "abc123" (if authenticated)                  │   │
│  │   • meteor.connection.id: "xyz789"                              │   │
│  │                                                                 │   │
│  │  ┌─────────────────────────────────────────────────────────┐   │   │
│  │  │ Child Span: mongodb.insert                              │   │   │
│  │  │ Duration: 12ms                                          │   │   │
│  │  │ Attributes:                                             │   │   │
│  │  │   • db.system: "mongodb"                                │   │   │
│  │  │   • db.name: "meteor"                                   │   │   │
│  │  │   • db.mongodb.collection: "links"                      │   │   │
│  │  └─────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Span Attributes

The following attributes are automatically added to method spans:

| Attribute | Description | Example |
|-----------|-------------|---------|
| `meteor.method.name` | The name of the method | `"links.insert"` |
| `meteor.userId` | The ID of the authenticated user (if any) | `"abc123"` |
| `meteor.connection.id` | The DDP connection ID | `"xyz789"` |
| `meteor.connection.clientAddress` | Client IP address | `"192.168.1.1"` |

### Example: Tracing Multiple Methods

Here's a complete example with multiple methods:

```javascript
// server/main.js

import os from 'node:os';
import { initOtel } from 'meteor/meteor-otel';

initOtel({
  serviceName: process.env.OTEL_SERVICE_NAME || 'meteor-app',
  resourceAttributes: {
    'deployment.environment': process.env.DEPLOYMENT_ENV || 'development',
    'service.instance.id': `${os.hostname()}-${process.pid}`,
  }
});

import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { LinksCollection } from '/imports/api/links';

Meteor.startup(async () => {
  // All methods in this block will be traced
  Meteor.methods({
    async 'links.insert'(data) {
      // ...
      return await LinksCollection.insertAsync({
        ...data,
        createdAt: new Date(),
        userId: this.userId,
      });
    },

    async 'links.update'(id, data) {
      // ...
      return await LinksCollection.updateAsync(id, { $set: data });
    },

    async 'links.remove'(id) {
      // ...
      return await LinksCollection.removeAsync(id);
    },

    async 'links.getStats'() {
      //...
      return { total, recent };
    },
  }, { otel: true });  // ← Enable tracing for all methods above
});
```

### Verifying Traces in Grafana

After enabling tracing, make some method calls from your client and then check Grafana:

1. **Open Grafana** at `http://localhost:3000`
2. Go to **Explore**
3. Select **Tempo** as the datasource
4. Use TraceQL to find your traces:

```
{ resource.service.name = "meteor-app" && name =~ "meteor.method.*" }
```

Or search for a specific method:

```
{ span.meteor.method.name = "links.insert" }
```

// TODO: add image of a trace in Grafana

### Error Handling in Traces

When a method throws an error, the span automatically:
- Sets status to `ERROR`
- Records the exception with stack trace
- Preserves the error message

```javascript
Meteor.methods({
  async 'links.insert'(data) {
    // If this throws, the span will capture the error
    if (!this.userId) {
      throw new Meteor.Error('not-authorized', 'You must be logged in');
    }

    return await LinksCollection.insertAsync(data);
  },
}, { otel: true });
```

In Grafana, you can search for failed spans:

```
{ status = error }
```

//TODO: add image of error span in Grafana

### What You Have Now

After enabling `{ otel: true }` on your methods:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Current Instrumentation Status                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ✅ OpenTelemetry initialized                                        │
│  ✅ Host metrics exported to Prometheus                              │
│  ✅ Method traces exported to Tempo                                  │
│  ❌ Publications not yet traced                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

In the next section, we'll enable the same automatic tracing for publications.

## Enabling Automatic Tracing for Publications

Just like methods, you can enable automatic tracing for Meteor publications. This is essential for understanding your real-time data flow and identifying slow queries.

### The `{ otel: true }` Option for Publications

Add `{ otel: true }` as the third argument to `Meteor.publish()`:

```javascript
// With tracing enabled
Meteor.publish('links', function () {
  return LinksCollection.find();
}, { otel: true });  // ← Add this!
```

## Next Steps

You now have automatic tracing enabled for your methods and publications. Continue to [Advanced Features](./otel-advanced.md) to learn about:

1. Adding events to spans with `addEvent()`
2. Creating custom spans with `withSpan()`
3. Building business metrics with `createMetricsRecorder()`
