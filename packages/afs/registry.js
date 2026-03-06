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
const _registryEmitter = new EventEmitter();
_registryEmitter.setMaxListeners(0);

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
    this._providers.delete(name);
    if (this._defaultProviderName === name) {
      // Fall back to first remaining provider
      const first = this._providers.keys().next().value;
      this._defaultProviderName = first || null;
    }
    _registryEmitter.emit('provider:removed', name);
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
   * Remove a collection from the registry.
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
   * Falls back to the general collection registry if not found in core.
   * Falls back to Mongo.Collection lookup if available.
   *
   * @param {string} name - Core collection identifier (e.g., 'users')
   * @returns {Object|undefined}
   */
  getCoreCollection(name) {
    // First try core registry
    const core = this._coreCollections.get(name);
    if (core) return core;

    // Then try general collection registry
    const general = this._collections.get(name);
    if (general) return general;

    // Fallback: try Mongo.getCollection if mongo package is loaded
    if (typeof Mongo !== 'undefined' && Mongo.getCollection) {
      return Mongo.getCollection(name);
    }

    return undefined;
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
   * Reset all registries. Primarily for testing.
   */
  _reset() {
    this._providers.clear();
    this._collections.clear();
    this._coreCollections.clear();
    this._defaultProviderName = null;
    _registryEmitter.removeAllListeners();
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
