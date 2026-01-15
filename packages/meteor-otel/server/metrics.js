/**
 * Metrics Utilities for Meteor
 *
 * Provides convenient helpers for creating and recording custom metrics.
 */

import { metrics } from '@opentelemetry/api';

/**
 * Create a metrics recorder for a specific meter.
 *
 * @param {string} meterName - Meter name (e.g., 'my-app.business')
 * @returns {Object} Metrics recorder with helper methods
 *
 * @example
 * const appMetrics = createMetricsRecorder('my-app');
 *
 * // Create counters, histograms, gauges
 * const ordersCounter = appMetrics.counter('orders.created', 'Number of orders created');
 * const latencyHistogram = appMetrics.histogram('order.latency', 'Order processing latency', 'ms');
 * const activeUsersGauge = appMetrics.gauge('users.active', 'Number of active users');
 *
 * // Record values
 * ordersCounter.add(1, { 'order.type': 'subscription' });
 * latencyHistogram.record(150, { 'order.type': 'subscription' });
 * activeUsersGauge.record(42);
 */
export function createMetricsRecorder(meterName) {
  const meter = metrics.getMeter(meterName);

  return {
    /**
     * Create a counter metric.
     *
     * @param {string} name - Metric name
     * @param {string} description - Metric description
     * @param {string} unit - Optional unit (e.g., 'ms', 'bytes')
     * @returns {Object} Counter with add() method
     */
    counter(name, description = '', unit = '') {
      const counter = meter.createCounter(name, {
        description,
        unit,
      });

      return {
        add(value = 1, attributes = {}) {
          counter.add(value, attributes);
        },
      };
    },

    /**
     * Create a histogram metric for recording distributions.
     *
     * @param {string} name - Metric name
     * @param {string} description - Metric description
     * @param {string} unit - Optional unit (e.g., 'ms', 'bytes')
     * @returns {Object} Histogram with record() method
     */
    histogram(name, description = '', unit = '') {
      const histogram = meter.createHistogram(name, {
        description,
        unit,
      });

      return {
        record(value, attributes = {}) {
          histogram.record(value, attributes);
        },
      };
    },

    /**
     * Create an up-down counter (can increase or decrease).
     *
     * @param {string} name - Metric name
     * @param {string} description - Metric description
     * @param {string} unit - Optional unit
     * @returns {Object} UpDownCounter with add() method
     */
    upDownCounter(name, description = '', unit = '') {
      const upDownCounter = meter.createUpDownCounter(name, {
        description,
        unit,
      });

      return {
        add(value, attributes = {}) {
          upDownCounter.add(value, attributes);
        },
        increment(attributes = {}) {
          upDownCounter.add(1, attributes);
        },
        decrement(attributes = {}) {
          upDownCounter.add(-1, attributes);
        },
      };
    },

    /**
     * Create an observable gauge (for async values).
     *
     * @param {string} name - Metric name
     * @param {string} description - Metric description
     * @param {string} unit - Optional unit
     * @param {Function} callback - Callback that returns the current value
     * @returns {Object} Observable gauge reference
     *
     * @example
     * appMetrics.observableGauge('queue.size', 'Current queue size', 'items', () => {
     *   return queue.length;
     * });
     */
    observableGauge(name, description = '', unit = '', callback) {
      const gauge = meter.createObservableGauge(name, {
        description,
        unit,
      });

      gauge.addCallback((result) => {
        const value = callback();
        if (typeof value === 'number') {
          result.observe(value);
        } else if (typeof value === 'object' && value !== null) {
          // Support returning { value, attributes }
          result.observe(value.value, value.attributes || {});
        }
      });

      return gauge;
    },

    /**
     * Create an observable counter (for async monotonic values).
     *
     * @param {string} name - Metric name
     * @param {string} description - Metric description
     * @param {string} unit - Optional unit
     * @param {Function} callback - Callback that returns the current value
     * @returns {Object} Observable counter reference
     */
    observableCounter(name, description = '', unit = '', callback) {
      const counter = meter.createObservableCounter(name, {
        description,
        unit,
      });

      counter.addCallback((result) => {
        const value = callback();
        if (typeof value === 'number') {
          result.observe(value);
        } else if (typeof value === 'object' && value !== null) {
          result.observe(value.value, value.attributes || {});
        }
      });

      return counter;
    },

    /**
     * Create an observable up-down counter.
     *
     * @param {string} name - Metric name
     * @param {string} description - Metric description
     * @param {string} unit - Optional unit
     * @param {Function} callback - Callback that returns the current value
     * @returns {Object} Observable up-down counter reference
     */
    observableUpDownCounter(name, description = '', unit = '', callback) {
      const counter = meter.createObservableUpDownCounter(name, {
        description,
        unit,
      });

      counter.addCallback((result) => {
        const value = callback();
        if (typeof value === 'number') {
          result.observe(value);
        } else if (typeof value === 'object' && value !== null) {
          result.observe(value.value, value.attributes || {});
        }
      });

      return counter;
    },

    /**
     * Get the underlying meter for advanced use cases.
     */
    getMeter() {
      return meter;
    },
  };
}

/**
 * Simple counter shortcut.
 *
 * @param {string} meterName - Meter name
 * @param {string} counterName - Counter name
 * @param {string} description - Description
 * @returns {Function} Function to increment the counter
 *
 * @example
 * const incrementOrders = simpleCounter('my-app', 'orders.created', 'Orders created');
 * incrementOrders(); // increment by 1
 * incrementOrders(5); // increment by 5
 * incrementOrders(1, { type: 'subscription' }); // with attributes
 */
export function simpleCounter(meterName, counterName, description = '') {
  const meter = metrics.getMeter(meterName);
  const counter = meter.createCounter(counterName, { description });

  return (value = 1, attributes = {}) => {
    counter.add(value, attributes);
  };
}

/**
 * Simple histogram shortcut.
 *
 * @param {string} meterName - Meter name
 * @param {string} histogramName - Histogram name
 * @param {string} description - Description
 * @param {string} unit - Unit
 * @returns {Function} Function to record values
 */
export function simpleHistogram(meterName, histogramName, description = '', unit = '') {
  const meter = metrics.getMeter(meterName);
  const histogram = meter.createHistogram(histogramName, { description, unit });

  return (value, attributes = {}) => {
    histogram.record(value, attributes);
  };
}

/**
 * Timer utility for measuring operation duration.
 *
 * @param {string} meterName - Meter name
 * @param {string} histogramName - Histogram name
 * @param {string} description - Description
 * @returns {Object} Timer with start() method
 *
 * @example
 * const dbTimer = createTimer('my-app', 'db.query.duration', 'Database query duration');
 *
 * const timer = dbTimer.start({ 'db.operation': 'find' });
 * await collection.find(query);
 * timer.end();
 */
export function createTimer(meterName, histogramName, description = '') {
  const meter = metrics.getMeter(meterName);
  const histogram = meter.createHistogram(histogramName, {
    description,
    unit: 'ms',
  });

  return {
    start(attributes = {}) {
      const startTime = performance.now();

      return {
        end(additionalAttributes = {}) {
          const duration = performance.now() - startTime;
          histogram.record(duration, { ...attributes, ...additionalAttributes });
          return duration;
        },
      };
    },

    /**
     * Time an async function.
     */
    async time(fn, attributes = {}) {
      const startTime = performance.now();
      try {
        return await fn();
      } finally {
        const duration = performance.now() - startTime;
        histogram.record(duration, attributes);
      }
    },

    /**
     * Time a sync function.
     */
    timeSync(fn, attributes = {}) {
      const startTime = performance.now();
      try {
        return fn();
      } finally {
        const duration = performance.now() - startTime;
        histogram.record(duration, attributes);
      }
    },
  };
}
