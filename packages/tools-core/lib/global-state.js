/**
 * Global state management for Meteor packages.
 * This module provides a way to store and retrieve global state that persists across file changes.
 *
 * State lives on `Package.meteor.global.persistentState`. The `meteor`
 * package's exported `global` object survives build-plugin re-instantiation
 * on rebuilds, which is what makes this state "persistent".
 */

/**
 * Gets a value from the global state.
 * @param {string} key - The key to retrieve.
 * @param {any} defaultValue - The default value to return if the key doesn't exist.
 * @returns {any} The value associated with the key, or the default value if not found.
 */
export function getGlobalState(key, defaultValue) {
  const value = Package.meteor?.global?.persistentState?.[key];
  return value !== undefined ? value : defaultValue;
}

/**
 * Sets a value in the global state.
 * @param {string} key - The key to set.
 * @param {any} value - The value to associate with the key.
 */
export function setGlobalState(key, value) {
  const meteorGlobal = Package.meteor?.global;
  if (!meteorGlobal) {
    return;
  }

  // Create a namespace for our global state if it doesn't exist
  if (!meteorGlobal.persistentState) {
    meteorGlobal.persistentState = {};
  }

  meteorGlobal.persistentState[key] = value;
}

/**
 * Removes a key from the global state.
 * @param {string} key - The key to remove.
 */
export function removeGlobalState(key) {
  const state = Package.meteor?.global?.persistentState;
  if (state) {
    delete state[key];
  }
}

/**
 * Clears all keys from the global state.
 */
export function clearGlobalState() {
  const meteorGlobal = Package.meteor?.global;
  if (meteorGlobal) {
    meteorGlobal.persistentState = {};
  }
}
