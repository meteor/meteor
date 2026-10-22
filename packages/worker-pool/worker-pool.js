/**
 * @module worker-pool
 * @summary Main entry point for the worker-pool package.
 * Exports the WorkerPool class and supporting utilities.
 *
 * @example
 * import { WorkerPool } from 'meteor/worker-pool';
 *
 * const pool = new WorkerPool({ min: 2, max: 8 });
 *
 * const result = await pool.dispatch({
 *   handler: async (data, { Collections, Meteor }) => {
 *     const docs = await Collections.Items.find({}).fetchAsync();
 *     return { count: docs.length };
 *   },
 *   data: { key: 'value' },
 *   timeout: 60000,
 * });
 *
 * console.log(result); // { count: 42 }
 *
 * // Stats
 * pool.stats(); // { total, idle, busy, spawning, pending }
 *
 * // Graceful shutdown
 * await pool.drain();
 *
 * // Force shutdown
 * await pool.terminate();
 */

export { WorkerPool } from './pool.js';
