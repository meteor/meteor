/**
 * @module jobs/config
 * @summary Configuration management for the jobs package.
 */

import { check, Match } from 'meteor/check';
import { Random } from 'meteor/random';
import ms from 'ms';

/**
 * Default configuration values.
 * @private
 */
const DEFAULTS = {
  concurrency: 20,
  pollInterval: 5000,
  stalledThreshold: 60000,
  heartbeatInterval: 15000,
  retentionPeriod: 604800000, // 7 days in ms
  leaderRenewalInterval: 10000,
  leaderTimeout: 30000,
  shutdownTimeout: 30000,
  instanceId: null,
  authorize: null,
  testMode: null,
};

/**
 * Internal mutable configuration object.
 * Starts as a shallow copy of DEFAULTS; mutated in place by `configure()`.
 * @private
 */
const _config = { ...DEFAULTS };

/**
 * Whether `instanceId` has been auto-generated yet.
 * We generate lazily on first access so that `Random` is guaranteed to be
 * loaded.
 * @private
 */
let _instanceIdResolved = false;

/**
 * Cached config snapshot — invalidated on every `configure()` call so
 * that hot-path consumers (`canAcceptJob`, heartbeat, polling) don't
 * allocate a new object on every read.
 * @type {Object|null}
 * @private
 */
let _cachedSnapshot = null;

/**
 * Validate and merge caller-supplied options into the active configuration.
 *
 * Can be called multiple times — each call merges on top of the previous
 * configuration.  Keys that are not supplied are left at their current value.
 *
 * @param {Object} options
 */
export function configure(options) {
  check(options, {
    concurrency: Match.Maybe(Match.Where(v => {
      check(v, Match.Integer);
      return v > 0;
    })),
    pollInterval: Match.Maybe(Match.Where(v => {
      check(v, Match.Integer);
      return v > 0;
    })),
    stalledThreshold: Match.Maybe(Match.Where(v => {
      check(v, Match.Integer);
      return v > 0;
    })),
    heartbeatInterval: Match.Maybe(Match.Where(v => {
      check(v, Match.Integer);
      return v > 0;
    })),
    retentionPeriod: Match.Maybe(Match.Where(v => {
      if (v === null) return true; // null = disable retention
      if (typeof v === 'number') {
        check(v, Match.Integer);
        return v > 0;
      }
      if (typeof v === 'string') {
        const parsed = ms(v);
        if (parsed === undefined || parsed <= 0) {
          throw new Match.Error(
            `retentionPeriod: unable to parse "${v}" — use a ms-compatible string like "7d" or "24h".`
          );
        }
        return true;
      }
      return false;
    })),
    leaderRenewalInterval: Match.Maybe(Match.Where(v => {
      check(v, Match.Integer);
      return v > 0;
    })),
    leaderTimeout: Match.Maybe(Match.Where(v => {
      check(v, Match.Integer);
      return v > 0;
    })),
    shutdownTimeout: Match.Maybe(Match.Where(v => {
      check(v, Match.Integer);
      return v > 0;
    })),
    instanceId: Match.Maybe(String),
    authorize: Match.Maybe(Match.Where(v => typeof v === 'function')),
    testMode: Match.Maybe(Match.Where(v => {
      if (v === null || v === 'inline' || v === 'manual') return true;
      throw new Match.Error(
        'testMode must be null, "inline", or "manual".'
      );
    })),
  });

  // Merge supplied keys into the live config.
  for (const key of Object.keys(options)) {
    if (options[key] !== undefined) {
      _config[key] = options[key];
    }
  }

  // If the caller explicitly sets instanceId, mark it resolved.
  if (options.instanceId != null) {
    _instanceIdResolved = true;
  }

  // Normalize retentionPeriod to milliseconds for runtime use.
  if (typeof _config.retentionPeriod === 'string') {
    _config.retentionPeriod = ms(_config.retentionPeriod);
  }

  // Invalidate cached snapshot.
  _cachedSnapshot = null;
}

/**
 * Reset the configuration to defaults.
 *
 * Test-only helper — prevents config mutation in one test from leaking
 * into subsequent tests.
 *
 * @private
 */
export function _resetConfigForTesting() {
  for (const key of Object.keys(DEFAULTS)) {
    _config[key] = DEFAULTS[key];
  }
  _instanceIdResolved = false;
  _cachedSnapshot = null;
}

/**
 * Return the current configuration snapshot.
 *
 * The first call ensures `instanceId` is populated (auto-generated via
 * `Random.id()` when the caller has not provided one).
 *
 * @returns {Object} A frozen snapshot of the active configuration.  Do not
 *   mutate — call `configure()` to change settings.
 */
export function getConfig() {
  if (!_instanceIdResolved) {
    _config.instanceId = Random.id();
    _instanceIdResolved = true;
    _cachedSnapshot = null;
  }
  if (!_cachedSnapshot) {
    _cachedSnapshot = Object.freeze({ ..._config });
  }
  return _cachedSnapshot;
}
