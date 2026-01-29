---
title: Advanced Features
description: Custom spans, events, and business metrics with meteor-otel
---

# Advanced Features

While automatic tracing captures the basic structure of your operations, you often need more granular control. This guide covers advanced instrumentation techniques: events, custom spans, and business metrics.

## Enriching Spans with Events

Events are timestamped annotations within a span. They mark important moments during an operation without creating new spans. Think of them as "breadcrumbs" that help you understand the flow of execution.

### What is addEvent()?

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Span: meteor.method orders.process                                      │
│ Duration: 850ms                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  0ms     ──●── Event: validation.start                                  │
│                  { orderId: "123" }                                     │
│                                                                         │
│  15ms    ──●── Event: validation.complete                               │
│                  { itemCount: 5 }                                       │
│                                                                         │
│  200ms   ──●── Event: payment.start                                     │
│                  { amount: 99.99, currency: "USD" }                     │
│                                                                         │
│  650ms   ──●── Event: payment.complete                                  │
│                  { transactionId: "tx_abc123" }                         │
│                                                                         │
│  850ms   ──●── Span ends                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Using addEvent()

Import `addEvent` from the package and call it within a traced method or publication:

```javascript
import { initOtel, addEvent } from 'meteor/meteor-otel';

// ... initOtel() ...

Meteor.methods({
  async 'orders.process'(orderId) {
    check(orderId, String);

    // Mark the start of validation
    addEvent('validation.start', { orderId });

    const order = await OrdersCollection.findOneAsync(orderId);
    if (!order) {
      addEvent('validation.failed', { reason: 'Order not found' });
      throw new Meteor.Error('not-found', 'Order not found');
    }

    addEvent('validation.complete', {
      itemCount: order.items.length,
      totalAmount: order.total,
    });

    // Mark payment processing
    addEvent('payment.start', {
      amount: order.total,
      currency: order.currency,
    });

    const paymentResult = await processPayment(order);

    addEvent('payment.complete', {
      transactionId: paymentResult.transactionId,
      status: paymentResult.status,
    });

    return { success: true, transactionId: paymentResult.transactionId };
  },
}, { otel: true });
```

### addEvent() API

```javascript
addEvent(eventName, attributes?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `eventName` | string | Name of the event (e.g., `"validation.start"`) |
| `attributes` | object | Optional key-value pairs with event context |

### Best Practices for Events

**DO use events for:**
- Marking phases of an operation (start/end of validation, payment, etc.)
- Recording important decisions or branch points
- Capturing error context before throwing
- Logging state changes

**DON'T use events for:**
- High-frequency operations (use metrics instead)
- Data that should be in span attributes
- Debugging output (use proper logging)

### Event Naming Conventions

Use a consistent naming pattern for events:

```javascript
// Good: verb.noun or phase.action pattern
addEvent('validation.start', { ... });
addEvent('validation.complete', { ... });
addEvent('payment.failed', { reason: '...' });
addEvent('inventory.reserved', { items: [...] });
addEvent('email.sent', { recipient: '...' });

// Bad: inconsistent or unclear naming
addEvent('start', { ... });           // Too vague
addEvent('done', { ... });            // What's done?
addEvent('error happened', { ... });  // Spaces, unclear
```

### Viewing Events in Grafana

Events appear in the trace detail view in Grafana. When you click on a span, you'll see:

1. The span's timeline
2. All events with their timestamps
3. Event attributes

// TODO: add image of events in Grafana trace view

## Custom Spans with withSpan

While automatic tracing captures method and publication calls, and events mark moments within a span, sometimes you need to trace a specific operation as a separate span with its own duration. The `withSpan()` function creates child spans within your traced methods.

### When to Use Custom Spans

Use `withSpan()` when you want to:
- Measure the duration of a specific operation separately
- Group related operations together
- Create a hierarchy of operations for better visualization
- Isolate slow parts of a method for analysis

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Span: meteor.method orders.process (850ms)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Child Span: validateOrder (45ms)                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Child Span: processPayment (520ms)                              │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │ Child Span: callPaymentGateway (480ms)                   │   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ Child Span: sendConfirmationEmail (180ms)                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Using withSpan()

Import `withSpan` from the package:

```javascript
import { initOtel, withSpan } from 'meteor/meteor-otel';
```

The `withSpan()` function wraps an async operation and creates a child span:

```javascript
Meteor.methods({
  async 'orders.process'(orderId) {
    check(orderId, String);

    // Create a child span for validation
    const order = await withSpan('orders', 'validateOrder', async () => {
      const order = await OrdersCollection.findOneAsync(orderId);
      if (!order) {
        throw new Meteor.Error('not-found', 'Order not found');
      }
      return order;
    }, { attributes: { 'order.id': orderId } });

    // Create a child span for payment processing
    const paymentResult = await withSpan('orders', 'processPayment', async () => {
      return await PaymentService.charge(order.total, order.paymentMethod);
    }, { attributes: { 'payment.amount': order.total } });

    // Create a child span for email
    await withSpan('orders', 'sendConfirmationEmail', async () => {
      await EmailService.send({
        to: order.customerEmail,
        template: 'order-confirmation',
        data: { order, paymentResult },
      });
    });

    return { success: true, transactionId: paymentResult.id };
  },
}, { otel: true });
```

### withSpan() API

```javascript
await withSpan(tracerName, spanName, asyncFunction, options?)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `tracerName` | string | Logical name for grouping related spans (e.g., `"orders"`, `"payments"`) |
| `spanName` | string | Name of this specific operation (e.g., `"validateOrder"`) |
| `asyncFunction` | function | The async function to execute within the span |
| `options` | object | Optional configuration |
| `options.attributes` | object | Key-value pairs to attach to the span |

### Adding Attributes to Spans

Attributes provide context about the operation:

```javascript
await withSpan('orders', 'processPayment', async () => {
  // ... payment logic
}, {
  attributes: {
    'payment.amount': 99.99,
    'payment.currency': 'USD',
    'payment.method': 'credit_card',
    'customer.id': customerId,
  }
});
```

### Error Handling

When the function inside `withSpan()` throws an error:
- The span is marked with `ERROR` status
- The exception is recorded on the span
- The error is re-thrown (so your error handling still works)

```javascript
await withSpan('orders', 'processPayment', async () => {
  const result = await PaymentService.charge(amount);

  if (!result.success) {
    // This error will be captured in the span
    throw new Meteor.Error('payment-failed', result.message);
  }

  return result;
});
```

### Nested Spans

You can nest `withSpan()` calls to create a hierarchy:

```javascript
Meteor.methods({
  async 'orders.process'(orderId) {
    // Parent span (automatic from { otel: true })

    await withSpan('orders', 'fulfillment', async () => {
      // Child span

      await withSpan('orders', 'checkInventory', async () => {
        // Grandchild span
        await InventoryService.check(orderId);
      });

      await withSpan('orders', 'reserveItems', async () => {
        // Another grandchild span
        await InventoryService.reserve(orderId);
      });

      await withSpan('orders', 'scheduleShipping', async () => {
        // Another grandchild span
        await ShippingService.schedule(orderId);
      });
    });
  },
}, { otel: true });
```

This creates a trace like:

```
meteor.method orders.process
└── fulfillment
    ├── checkInventory
    ├── reserveItems
    └── scheduleShipping
```

### Synchronous Version: withSpanSync()

For synchronous operations, use `withSpanSync()`:

```javascript
import { withSpanSync } from 'meteor/meteor-otel';

const result = withSpanSync('compute', 'calculateTotals', () => {
  // Synchronous computation
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}, { attributes: { 'items.count': items.length } });
```

### Events vs Custom Spans: When to Use Each

| Use Case | Use Events | Use withSpan |
|----------|------------|--------------|
| Mark a moment in time | ✅ | ❌ |
| Measure operation duration | ❌ | ✅ |
| Add context without new span | ✅ | ❌ |
| Isolate slow operations | ❌ | ✅ |
| High-frequency markers | ✅ | ❌ |
| Create trace hierarchy | ❌ | ✅ |

### Viewing Custom Spans in Grafana

Custom spans appear as children of the parent span in Grafana's trace view:

1. Go to **Explore** → **Tempo**
2. Find a trace for your method
3. Expand the trace to see the span hierarchy
4. Click on individual spans to see their attributes and duration

// TODO: add image of nested spans in Grafana

## Custom Metrics with createMetricsRecorder

While `initOtel()` provides automatic system metrics (Node.js runtime, process info), you'll often want to track **business-specific metrics** unique to your application. The `createMetricsRecorder` function gives you a simple API to create custom counters, histograms, and gauges.

### Why Custom Metrics?

Custom metrics answer questions that automatic instrumentation can't:

- **How many orders were placed in each cluster?** → Counter
- **What's the average checkout latency for X region?** → Histogram
- **How many items are currently in users' carts?** → UpDownCounter (gauge-like)

### Creating a Metrics Recorder

First, create a metrics recorder with a namespace for your metrics:

```javascript
import { createMetricsRecorder } from 'meteor/meteor-otel';

// Create a recorder - all metrics will be prefixed with this namespace
const appMetrics = createMetricsRecorder('myapp');
```

The namespace helps organize your metrics in Grafana. Metrics created with this recorder will be named like `myapp.orders.created`, `myapp.checkout.latency`, etc.

### Metric Types

The `createMetricsRecorder` provides three types of metrics:

#### 1. Counter - Monotonically Increasing Values

Counters only go up. Use them for things you count: requests, orders, errors, emails sent.

```javascript
// Create a counter
const ordersCounter = appMetrics.counter(
  'orders.created',        // metric name
  'Number of orders created', // description
  'orders'                 // unit
);

// Use it in your methods
Meteor.methods({
  async 'orders.create'(items) {
    // ... create order logic ...

    // Increment the counter
    ordersCounter.add(1);

    // Or with attributes for more granular tracking
    ordersCounter.add(1, {
      'order.type': 'subscription',
      'payment.method': 'credit_card'
    });

    return orderId;
  }
}, { otel: true });
```

#### 2. Histogram - Distribution of Values

Histograms track the distribution of values over time. Perfect for latencies, sizes, or any value where you care about percentiles (p50, p95, p99).

```javascript
// Create a histogram
const checkoutLatency = appMetrics.histogram(
  'checkout.latency',
  'Time to complete checkout',
  'ms'
);

Meteor.methods({
  async 'orders.checkout'(cartId) {
    const startTime = Date.now();

    try {
      // ... checkout logic ...
      return result;
    } finally {
      // Record the latency
      const latency = Date.now() - startTime;
      checkoutLatency.record(latency, { 'cart.id': cartId });
    }
  }
}, { otel: true });
```

In Grafana, you can then query percentiles:

```promql
# 95th percentile checkout latency
histogram_quantile(0.95, rate(myapp_checkout_latency_bucket[5m]))
```

#### 3. UpDownCounter - Values That Can Increase or Decrease

UpDownCounters can go up or down. Use them for current counts: active users, items in cart, open connections.

```javascript
// Create an up-down counter
const activeCartsCounter = appMetrics.upDownCounter(
  'carts.active',
  'Number of active shopping carts',
  'carts'
);

Meteor.methods({
  async 'cart.create'(userId) {
    // ... create cart ...
    activeCartsCounter.add(1, { 'user.type': 'registered' });
    return cartId;
  },

  async 'cart.checkout'(cartId) {
    // ... process checkout ...
    activeCartsCounter.add(-1); // Decrement when cart is checked out
  },

  async 'cart.abandon'(cartId) {
    // ... cleanup ...
    activeCartsCounter.add(-1); // Decrement when cart is abandoned
  }
}, { otel: true });
```

### Complete Example: E-commerce Metrics

Here's a practical example combining all metric types:

```javascript
// server/metrics.js
import { createMetricsRecorder } from 'meteor/meteor-otel';

const ecommerceMetrics = createMetricsRecorder('ecommerce');

export const metrics = {
  // Counters
  ordersCreated: ecommerceMetrics.counter(
    'orders.created',
    'Total orders created',
    'orders'
  ),
  paymentsFailed: ecommerceMetrics.counter(
    'payments.failed',
    'Failed payment attempts',
    'payments'
  ),

  // Histograms
  checkoutLatency: ecommerceMetrics.histogram(
    'checkout.latency',
    'Checkout processing time',
    'ms'
  ),
  orderValue: ecommerceMetrics.histogram(
    'order.value',
    'Order total value',
    'USD'
  ),

  // UpDownCounters
  activeCarts: ecommerceMetrics.upDownCounter(
    'carts.active',
    'Currently active shopping carts',
    'carts'
  ),
  itemsInStock: ecommerceMetrics.upDownCounter(
    'inventory.items',
    'Items currently in stock',
    'items'
  ),
};
```

```javascript
// server/methods/orders.js
import { metrics } from '../metrics';

Meteor.methods({
  async 'orders.checkout'(cartId) {
    const startTime = Date.now();

    try {
      const cart = await CartsCollection.findOneAsync(cartId);
      const order = await processOrder(cart);

      // Record metrics
      metrics.ordersCreated.add(1, {
        'order.type': cart.type,
        'user.tier': cart.userTier
      });
      metrics.orderValue.record(order.total);
      metrics.activeCarts.add(-1);

      // Update inventory
      for (const item of cart.items) {
        metrics.itemsInStock.add(-item.quantity, {
          'product.category': item.category
        });
      }

      return order._id;

    } catch (error) {
      if (error.type === 'PaymentFailed') {
        metrics.paymentsFailed.add(1, {
          'error.code': error.code
        });
      }
      throw error;

    } finally {
      metrics.checkoutLatency.record(Date.now() - startTime);
    }
  }
}, { otel: true });
```

### Metric Attributes Best Practices

Attributes add dimensions to your metrics, enabling powerful filtering and grouping in Grafana:

```javascript
// Good: Low-cardinality attributes
ordersCounter.add(1, {
  'order.type': 'subscription',      // Few distinct values
  'payment.method': 'credit_card',   // Few distinct values
  'region': 'us-east',               // Few distinct values
});

// Bad: High-cardinality attributes (avoid these!)
ordersCounter.add(1, {
  'user.id': userId,      // Thousands of unique values
  'order.id': orderId,    // Unique per order
  'timestamp': Date.now() // Unique per call
});
```

**Why does cardinality matter?** Each unique combination of attribute values creates a separate time series. High-cardinality attributes can cause:
- Excessive memory usage in Prometheus
- Slow queries in Grafana
- Higher storage costs

### Querying Custom Metrics in Grafana

Your custom metrics are available in Prometheus. Here are example queries:

```promql
# Total orders in the last hour
increase(ecommerce_orders_created_total[1h])

# Orders per minute by type
rate(ecommerce_orders_created_total[5m]) by (order_type)

# Average checkout latency
rate(ecommerce_checkout_latency_sum[5m]) / rate(ecommerce_checkout_latency_count[5m])

# 99th percentile checkout latency
histogram_quantile(0.99, rate(ecommerce_checkout_latency_bucket[5m]))

# Current active carts
ecommerce_carts_active

# Payment failure rate
rate(ecommerce_payments_failed_total[5m]) / rate(ecommerce_orders_created_total[5m])
```

### API Reference

```javascript
const recorder = createMetricsRecorder(namespace);

// Counter (monotonically increasing)
const counter = recorder.counter(name, description, unit);
counter.add(value, attributes?);

// Histogram (distribution of values)
const histogram = recorder.histogram(name, description, unit);
histogram.record(value, attributes?);

// UpDownCounter (can increase or decrease)
const upDownCounter = recorder.upDownCounter(name, description, unit);
upDownCounter.add(value, attributes?);  // positive or negative
```

## Summary

You now have all the tools to fully instrument your Meteor application:

| Feature | Use Case |
|---------|----------|
| `initOtel()` | Initialize OpenTelemetry and export host metrics |
| `{ otel: true }` | Automatic tracing for methods and publications |
| `addEvent()` | Mark important moments within a span |
| `withSpan()` | Create custom child spans for specific operations |
| `createMetricsRecorder()` | Track business-specific counters, histograms, and gauges |

With these tools, you can gain deep insights into your application's behavior, identify performance bottlenecks, and track business metrics that matter to your team.
