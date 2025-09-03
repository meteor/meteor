/**
 * Global state management for Meteor packages.
 * This module provides a way to store and retrieve global state that persists across file changes.
 */

/**
 * Gets a value from the global state.
 * @param {string} key - The key to retrieve.
 * @param {any} defaultValue - The default value to return if the key doesn't exist.
 * @returns {any} The value associated with the key, or the default value if not found.
 */
export function getGlobalState(key, defaultValue) {
  return Package.meteor?.global?.[key] !== undefined
    ? Package.meteor.global.persistentState[key]
    : defaultValue;
}

/**
 * Sets a value in the global state.
 * @param {string} key - The key to set.
 * @param {any} value - The value to associate with the key.
 */
export function setGlobalState(key, value) {
  // Create a namespace for our global state if it doesn't exist
  if (!Package?.meteor.global.persistentState) {
    Package.meteor.global.persistentState = {};
  }

  Package.meteor.global.persistentState[key] = value;
}

/**
 * Removes a key from the global state.
 * @param {string} key - The key to remove.
 */
export function removeGlobalState(key) {
  delete Package.meteor.global.persistentState[key];
}

/**
 * Clears all keys from the global state.
 */
export function clearGlobalState() {
  Package.meteor.global.persistentState = {};
}
