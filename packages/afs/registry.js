/**
 * AFS Registry - Global registration and lookup for providers and collections.
 *
 * The registry serves three purposes:
 * 1. Provider registry: Register data source providers by name
 * 2. Collection registry: Register collections by name (across all providers)
 * 3. Core collection registry: Special lookup for framework collections (users, etc.)
 *
 * This enables packages like accounts-base to find the users collection
 * regardless of whether it's backed by MongoDB, PostgreSQL, or anything else.
 *
 * Extends EventEmitter to emit lifecycle events:
 *   - provider:registered(name, provider)
 *   - provider:removed(name)
 *   - provider:default-changed(name, provider)
 *   - collection:registered(name, collection)
 *   - collection:removed(name)
 *   - core-collection:registered(name, collection)
 */

import { EventEmitter } from 'events';
import { _resetAllForTests as _resetLocalCollections } from './collection/local-collection-driver';

const _registryEmitter = new EventEmitter();
_registryEmitter.setMaxListeners(0);

// Pluggable core-collection resolvers. External packages (e.g. mongo) register
// a resolver via AFS.registerCoreResolver so the AFS registry stays free of
// any hard dependency on a specific data source.
const _coreResolvers = [];

export const Registry = {
  // ---------------------------------------------------------------------------
  // Provider management
  // ---------------------------------------------------------------------------

  /** @type {Map<string, StreamProvider>} */
  _providers: new Map(),

  /** @type {string|null} */
  _defaultProviderName: null,

  /**
   * Register a data source provider.
   * @param {string} name - Provider identifier (e.g., 'mongo', 'postgres')
   * @param {StreamProvider} provider - The provider instance
   */
  registerProvider(name, provider) {
    if (this._providers.has(name)) {
      console.warn(`AFS: Provider '${name}' is already registered. Overwriting.`);
    }
    this._providers.set(name, provider);

    // First provider registered becomes default
    if (!this._defaultProviderName) {
      this._defaultProviderName = name;
    }

    _registryEmitter.emit('provider:registered', name, provider);
  },

  /**
   * Get a registered provider by name.
   * @param {string} name
   * @returns {StreamProvider|undefined}
   */
  getProvider(name) {
    return this._providers.get(name);
  },

  /**
   * Set the default provider used when no provider is specified.
   * @param {string} name - Must be a previously registered provider name
   */
  setDefaultProvider(name) {
    if (!this._providers.has(name)) {
      throw new Error(`AFS: Cannot set default to unregistered provider '${name}'`);
    }
    this._defaultProviderName = name;
    _registryEmitter.emit('provider:default-changed', name, this._providers.get(name));
  },

  /**
   * Get the default provider.
   * @returns {StreamProvider|null}
   */
  getDefaultProvider() {
    if (!this._defaultProviderName) return null;
    return this._providers.get(this._defaultProviderName) || null;
  },

  /**
   * Get the name of the default provider.
   * @returns {string|null}
   */
  getDefaultProviderName() {
    return this._defaultProviderName;
  },

  /**
   * List all registered provider names.
   * @returns {string[]}
   */
  listProviders() {
    return Array.from(this._providers.keys());
  },

  /**
   * Remove a provider registration.
   * @param {string} name
   */
  removeProvider(name) {
    const wasDefault = this._defaultProviderName === name;
    this._providers.delete(name);
    let defaultChanged = false;
    let newDefaultName = null;
    if (wasDefault) {
      // Fall back to first remaining provider
      const first = this._providers.keys().next().value;
      newDefaultName = first || null;
      this._defaultProviderName = newDefaultName;
      defaultChanged = true;
    }
    _registryEmitter.emit('provider:removed', name);
    if (defaultChanged) {
      const newProvider = newDefaultName
        ? this._providers.get(newDefaultName)
        : null;
      _registryEmitter.emit('provider:default-changed', newDefaultName, newProvider);
    }
  },

  // ---------------------------------------------------------------------------
  // Collection registry (all AFS-managed collections)
  // ---------------------------------------------------------------------------

  /** @type {Map<string, Object>} */
  _collections: new Map(),

  /**
   * Register a collection (FederatedCollection or Mongo.Collection).
   * @param {string} name - Collection name
   * @param {Object} collection - The collection instance
   */
  registerCollection(name, collection) {
    this._collections.set(name, collection);
    _registryEmitter.emit('collection:registered', name, collection);
  },

  /**
   * Get a collection by name (from any provider).
   * @param {string} name
   * @returns {Object|undefined}
   */
  getCollection(name) {
    return this._collections.get(name);
  },

  /**
   * List all registered collection names.
   * @returns {string[]}
   */
  listCollections() {
    return Array.from(this._collections.keys());
  },

  /**
   * Remove a collection from the registry. Registry-only: this does NOT
   * tear down an active FederatedCollection instance, stop its observers,
   * or clear its local-collection cache. Call `collection.destroy()` on
   * the instance for full teardown, or `collection.dropCollectionAsync()`
   * to also delete the underlying data.
   * @param {string} name
   */
  removeCollection(name) {
    this._collections.delete(name);
    this._coreCollections.delete(name);
    _registryEmitter.emit('collection:removed', name);
  },

  // ---------------------------------------------------------------------------
  // Core collection registry (framework-level collections)
  // ---------------------------------------------------------------------------

  /** @type {Map<string, Object>} Core collections (users, roles, etc.) */
  _coreCollections: new Map(),

  /**
   * Register a core framework collection.
   *
   * Core collections are special collections used by Meteor's framework packages
   * (e.g., 'users' for accounts-base, 'roles' for roles package). This allows
   * these packages to find their collections regardless of the backing data source.
   *
   * @param {string} name - Core collection identifier (e.g., 'users')
   * @param {Object} collection - The collection instance
   */
  registerCoreCollection(name, collection) {
    this._coreCollections.set(name, collection);
    // Also register in the general collection registry
    this._collections.set(name, collection);
    _registryEmitter.emit('core-collection:registered', name, collection);
    _registryEmitter.emit('collection:registered', name, collection);
  },

  /**
   * Get a core framework collection by name.
   *
   * Lookup order:
   *   1. core-collection registry
   *   2. general collection registry
   *   3. each resolver registered via registerCoreResolver, in insertion order
   *
   * The registry has no hard dependency on any particular data source.
   * Packages like `mongo` register a resolver to expose their collections.
   *
   * @param {string} name - Core collection identifier (e.g., 'users')
   * @returns {Object|undefined}
   */
  getCoreCollection(name) {
    const core = this._coreCollections.get(name);
    if (core) return core;

    const general = this._collections.get(name);
    if (general) return general;

    for (const resolver of _coreResolvers) {
      try {
        const resolved = resolver(name);
        if (resolved) return resolved;
      } catch (_e) {
        // A broken resolver must not break the chain.
      }
    }

    return undefined;
  },

  /**
   * Register a resolver used by getCoreCollection as a last-resort lookup.
   * Resolvers are called in insertion order; the first truthy return wins.
   * @param {Function} resolver - (name) => collection | undefined
   */
  registerCoreResolver(resolver) {
    if (typeof resolver !== 'function') {
      throw new TypeError('registerCoreResolver requires a function');
    }
    _coreResolvers.push(resolver);
  },

  /**
   * Remove a previously-registered core resolver. Primarily for testing.
   * @param {Function} resolver
   * @returns {boolean} true if removed
   */
  unregisterCoreResolver(resolver) {
    const idx = _coreResolvers.indexOf(resolver);
    if (idx === -1) return false;
    _coreResolvers.splice(idx, 1);
    return true;
  },

  /**
   * Check if a core collection is registered.
   * @param {string} name
   * @returns {boolean}
   */
  hasCoreCollection(name) {
    return this._coreCollections.has(name);
  },

  /**
   * List all core collection names.
   * @returns {string[]}
   */
  listCoreCollections() {
    return Array.from(this._coreCollections.keys());
  },

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Reset all registries. Test-only.
   *
   * Caveat: this removes ALL listeners attached via Registry.on/.once
   * (including any from long-lived external test harnesses). Tests that
   * need harness listeners to persist across resets should re-attach them
   * after each _resetForTests() call. Throws if called outside a Meteor
   * test environment.
   */
  _resetForTests() {
    const inTest =
      (typeof Meteor !== 'undefined' && (Meteor.isTest || Meteor.isAppTest || Meteor.isPackageTest)) ||
      process.env.NODE_ENV === 'test';
    if (!inTest) {
      throw new Error('Registry._resetForTests may only be called from tests');
    }
    this._providers.clear();
    this._collections.clear();
    this._coreCollections.clear();
    this._defaultProviderName = null;
    _coreResolvers.length = 0;
    _registryEmitter.removeAllListeners();
    // Wipe the process-global LocalCollection cache so tests cannot
    // inherit Minimongo state from a prior run.
    _resetLocalCollections();
  },

  /**
   * @deprecated Use _resetForTests. Kept as an alias so existing test code
   * does not break during the rename rollout. Applies the same test-env guard.
   */
  _reset() {
    this._resetForTests();
  },

  // ---------------------------------------------------------------------------
  // EventEmitter delegation
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to registry events.
   * @param {string} event - Event name
   * @param {Function} listener - Callback
   * @returns {Object} The Registry (for chaining)
   */
  on(event, listener) {
    _registryEmitter.on(event, listener);
    return this;
  },

  /**
   * Subscribe to a registry event once.
   * @param {string} event
   * @param {Function} listener
   * @returns {Object}
   */
  once(event, listener) {
    _registryEmitter.once(event, listener);
    return this;
  },

  /**
   * Unsubscribe from a registry event.
   * @param {string} event
   * @param {Function} listener
   * @returns {Object}
   */
  off(event, listener) {
    _registryEmitter.removeListener(event, listener);
    return this;
  },
};
