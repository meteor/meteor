/**
 * @module jobs/registration
 * @summary Job registration system — validates and stores job definitions.
 */

import { Cron } from 'croner';

/**
 * Internal registry of job definitions, keyed by job name.
 * @private
 * @type {Map<string, Object>}
 */
const _registry = new Map();

/**
 * Default values applied to every registered job definition.
 * @private
 */
const REGISTRATION_DEFAULTS = {
  missedRun: 'run-once',
  offload: false,
  timeout: 300000,
  concurrency: Infinity,
  retries: 3,
  backoff: 'exponential',
  backoffDelay: 1000,
  backoffMaxDelay: 300000,
  onDuplicate: 'skip',
};

/**
 * Validate and register a job definition.
 *
 * The full config object is validated up-front so that mistakes are caught
 * at startup rather than when the job first runs.  After validation the
 * definition (with defaults applied) is stored in the internal registry.
 *
 * @param {Object} config  Job definition — see the Jobs spec for all fields.
 * @throws {Error} If validation fails or a job with the same name is
 *   already registered.
 */
export function registerJob(config) {
  if (config == null || typeof config !== 'object') {
    throw new Error('Jobs.register() requires a configuration object.');
  }

  // --- Required fields ---------------------------------------------------

  const { name, run } = config;

  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Jobs.register(): "name" must be a non-empty string.');
  }

  if (typeof run !== 'function') {
    throw new Error(`Jobs.register("${name}"): "run" must be a function.`);
  }

  if (_registry.has(name)) {
    throw new Error(
      `Jobs.register("${name}"): a job with this name is already registered.`
    );
  }

  // --- Optional field validation -----------------------------------------

  if (config.schedule !== undefined) {
    if (typeof config.schedule !== 'string') {
      throw new Error(
        `Jobs.register("${name}"): "schedule" must be a cron expression string.`
      );
    }
    try {
      // eslint-disable-next-line no-new
      new Cron(config.schedule);
    } catch (e) {
      throw new Error(
        `Jobs.register("${name}"): invalid cron expression "${config.schedule}" — ${e.message}`
      );
    }
  }

  if (config.timezone !== undefined) {
    if (typeof config.timezone !== 'string') {
      throw new Error(
        `Jobs.register("${name}"): "timezone" must be a string (IANA timezone).`
      );
    }
  }

  if (config.missedRun !== undefined) {
    if (config.missedRun !== 'run-once' && config.missedRun !== 'skip') {
      throw new Error(
        `Jobs.register("${name}"): "missedRun" must be "run-once" or "skip".`
      );
    }
  }

  if (config.offload !== undefined) {
    if (typeof config.offload !== 'boolean') {
      throw new Error(
        `Jobs.register("${name}"): "offload" must be a boolean.`
      );
    }
  }

  if (config.timeout !== undefined) {
    if (!Number.isInteger(config.timeout) || config.timeout <= 0) {
      throw new Error(
        `Jobs.register("${name}"): "timeout" must be a positive integer.`
      );
    }
  }

  if (config.concurrency !== undefined) {
    if (
      config.concurrency !== Infinity &&
      (!Number.isInteger(config.concurrency) || config.concurrency <= 0)
    ) {
      throw new Error(
        `Jobs.register("${name}"): "concurrency" must be a positive integer or Infinity.`
      );
    }
  }

  if (config.retries !== undefined) {
    if (!Number.isInteger(config.retries) || config.retries < 0) {
      throw new Error(
        `Jobs.register("${name}"): "retries" must be a non-negative integer.`
      );
    }
  }

  if (config.backoff !== undefined) {
    const validStrings = ['fixed', 'exponential'];
    if (
      typeof config.backoff !== 'function' &&
      !validStrings.includes(config.backoff)
    ) {
      throw new Error(
        `Jobs.register("${name}"): "backoff" must be "fixed", "exponential", or a function.`
      );
    }
  }

  if (config.backoffDelay !== undefined) {
    if (!Number.isInteger(config.backoffDelay) || config.backoffDelay <= 0) {
      throw new Error(
        `Jobs.register("${name}"): "backoffDelay" must be a positive integer.`
      );
    }
  }

  if (config.backoffMaxDelay !== undefined) {
    if (
      !Number.isInteger(config.backoffMaxDelay) ||
      config.backoffMaxDelay <= 0
    ) {
      throw new Error(
        `Jobs.register("${name}"): "backoffMaxDelay" must be a positive integer.`
      );
    }
  }

  if (config.unique !== undefined) {
    if (typeof config.unique !== 'function') {
      throw new Error(
        `Jobs.register("${name}"): "unique" must be a function.`
      );
    }
  }

  if (config.onDuplicate !== undefined) {
    const valid = ['skip', 'replace', 'error'];
    if (!valid.includes(config.onDuplicate)) {
      throw new Error(
        `Jobs.register("${name}"): "onDuplicate" must be "skip", "replace", or "error".`
      );
    }
  }

  if (config.onFailure !== undefined) {
    if (typeof config.onFailure !== 'function') {
      throw new Error(
        `Jobs.register("${name}"): "onFailure" must be a function.`
      );
    }
  }

  if (config.onComplete !== undefined) {
    if (typeof config.onComplete !== 'function') {
      throw new Error(
        `Jobs.register("${name}"): "onComplete" must be a function.`
      );
    }
  }

  // --- Build definition with defaults ------------------------------------

  const definition = {
    ...REGISTRATION_DEFAULTS,
    ...config,
  };

  _registry.set(name, definition);
}

/**
 * Check whether a job with the given name is registered.
 *
 * @param {string} name  The job name.
 * @returns {boolean}
 */
export function hasJob(name) {
  return _registry.has(name);
}

/**
 * Retrieve the full definition for a registered job.
 *
 * @param {string} name  The job name.
 * @returns {Object|undefined}  The stored definition, or `undefined` if
 *   no job with that name is registered.
 */
export function getJobDefinition(name) {
  return _registry.get(name);
}

/**
 * Return all registered job definitions that have a cron `schedule` set.
 *
 * Used by the cron scheduler to discover which jobs need periodic timers.
 *
 * @returns {Object[]}  Array of job definitions with a `schedule` property.
 */
export function getScheduledJobs() {
  const results = [];
  for (const def of _registry.values()) {
    if (def.schedule) {
      results.push(def);
    }
  }
  return results;
}

/**
 * Clear all registered job definitions.
 *
 * Test-only helper — prevents registrations in one test from leaking
 * into subsequent tests.
 *
 * @private
 */
export function _resetRegistryForTesting() {
  _registry.clear();
}
