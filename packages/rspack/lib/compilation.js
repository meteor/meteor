/**
 * @module compilation-helpers
 * @description Helper functions for Rspack compilation tracking
 * 
 * This module provides utility functions for tracking Rspack compilations,
 * including setting up compilation tracking, waiting for first compilation,
 * and formatting time values.
 */

const {
  GLOBAL_STATE_KEYS
} = require('./constants');

const {
  getGlobalState,
  setGlobalState
} = require('meteor/tools-core/lib/global-state');

const { applyDelegatedExtensions } = require('./config');
const {
  bumpClientRuntimeBuildId,
  bumpServerRuntimeBuildId,
} = require('./build-context');

// Helper function to format milliseconds with comma separators
function formatMilliseconds(ms) {
  return ms.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Module-level references to the first-compile state objects created by
// the most recent setupCompilationTracking call, so process management
// can fail them without going through the global state (whose getter
// only returns defaults; see tools-core/lib/global-state.js).
const currentFirstCompileStates = {
  client: null,
  server: null,
};

/**
 * Fails the pending first-compilation promise for one side.
 *
 * The Rspack child processes normally resolve the first-compile promises
 * through their stdout. If a process dies or panics before its first
 * compilation completes, those promises would never settle and
 * waitForFirstCompilation - and with it the whole Meteor build - would
 * hang forever. Reject them instead so the user gets an actionable error.
 *
 * @param {string} side - 'client' or 'server'
 * @param {string} detail - What happened to the process
 * @returns {void}
 */
export function failFirstCompilation(side, detail) {
  const state = currentFirstCompileStates[side];
  if (!state || state.resolved || state.rejected ||
      typeof state.reject !== 'function') {
    return;
  }
  state.rejected = true;
  state.reject(new Error(
    `Rspack ${side} process ${detail} before completing its first ` +
    `compilation. Review the Rspack error output above for the underlying ` +
    `cause. If the process was interrupted while writing its cache, remove ` +
    `node_modules/.cache/rspack or run "meteor reset", then run again.`
  ));
}

/**
 * Sets up compilation tracking and callbacks
 * @returns {Object} Object containing compilation tracking state and callbacks
 */
export function setupCompilationTracking() {
  // Initialize global state for first compilation tracking
  const clientFirstCompile = {
    resolved: false,
    resolve: null
  };
  const serverFirstCompile = {
    resolved: false,
    resolve: null
  };

  // Store in global state
  setGlobalState(GLOBAL_STATE_KEYS.CLIENT_FIRST_COMPILE, clientFirstCompile);
  setGlobalState(GLOBAL_STATE_KEYS.SERVER_FIRST_COMPILE, serverFirstCompile);

  // Also keep direct references for failFirstCompilation
  currentFirstCompileStates.client = clientFirstCompile;
  currentFirstCompileStates.server = serverFirstCompile;

  // Create promises for first compilation of client and server. The
  // reject handles let process management fail these promises when an
  // Rspack process dies or panics before its first compilation, so
  // waitForFirstCompilation errors out instead of hanging forever.
  const clientFirstCompilePromise = new Promise((resolve, reject) => {
    clientFirstCompile.resolve = resolve;
    clientFirstCompile.reject = reject;
  });

  const serverFirstCompilePromise = new Promise((resolve, reject) => {
    serverFirstCompile.resolve = resolve;
    serverFirstCompile.reject = reject;
  });

  // waitForFirstCompilation may await only one of these promises
  // (depending on its target option); attach no-op handlers so a
  // rejection of the other side never surfaces as an unhandled
  // promise rejection.
  clientFirstCompilePromise.catch(() => {});
  serverFirstCompilePromise.catch(() => {});

  // Create a shared state to track compilation times
  const compilationState = {
    clientMs: null,
    serverMs: null,
    timeoutId: null,
    initialCompilationOccurred: false,
    previousClientResolved: false,
    previousServerResolved: false,
    previousMaxTime: 0,
    // Base delay in milliseconds
    baseDelay: 100,
    // Calculate dynamic defer time based on previous maximum time
    calculateDeferTime: function() {
      // Use a fixed base delay plus a margin based on previous maximum time
      // The margin is 20% of the previous maximum time
      return this.baseDelay + this.previousMaxTime;
    },
    // Function to print the maximum time once compilations are complete
    printMaxTime: function() {
      const clientResolved = clientFirstCompile?.resolved || false;
      const serverResolved = serverFirstCompile?.resolved || false;

      // Check if this is the first time both client and server are resolved
      // but were previously not both resolved
      if (clientResolved && serverResolved && 
          !(this.previousClientResolved && this.previousServerResolved) && 
          !this.initialCompilationOccurred) {
        this.initialCompilationOccurred = true;
      }

      // Update previous resolved states for next call
      this.previousClientResolved = clientResolved;
      this.previousServerResolved = serverResolved;

      const shouldPrint = this.initialCompilationOccurred &&
        (this.clientMs !== null || this.serverMs !== null);

      // Clear any existing timeout
      if (this.timeoutId !== null) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }

      // Handle cases where only one compilation runs
      if (shouldPrint) {
        // Use the available time or default to the other one
        const clientTime = this.clientMs !== null ? this.clientMs : 0;
        const serverTime = this.serverMs !== null ? this.serverMs : 0;

        // Calculate defer time based on previous maximum time
        const deferTime = this.calculateDeferTime();

        // Set a timeout to wait for both compilations to likely finish
        this.timeoutId = setTimeout(() => {
          const maxMs = Math.max(clientTime, serverTime);
          console.log(
            `| Total: ${formatMilliseconds(maxMs)} ms (Rspack ${
              this.initialCompilationOccurred ? 'Rebuild' : 'Build'
            } App)`
          );

          // Store the current maximum time for future defer time calculations
          this.previousMaxTime = Math.max(maxMs, this.previousMaxTime);

          // Reset the state for next compilation cycle
          clearTimeout(this.timeoutId);
          this.clientMs = null;
          this.serverMs = null;
          this.timeoutId = null;
        }, deferTime);
      }
    },
  };

  // Define separate onCompile callbacks for client and server
  const onCompileClient = (data, config) => {
    if (config?.isRebuild && !config?.hasErrors) {
      bumpClientRuntimeBuildId();
    }

    // Resolve the promise if it's the first compilation
    const clientState = getGlobalState(GLOBAL_STATE_KEYS.CLIENT_FIRST_COMPILE, clientFirstCompile);
    if (!clientState?.resolved && !clientState?.rejected) {
      // Apply delegated extensions before resolving (so they're set before Meteor scans)
      if (config?.delegatedExtensions?.length > 0) {
        applyDelegatedExtensions(config.delegatedExtensions);
      }

      clientState.resolved = true;
      clientState.resolve();
      setGlobalState(GLOBAL_STATE_KEYS.CLIENT_FIRST_COMPILE, clientState);
    }

    if (process.env.METEOR_PROFILE) {
      // Extract milliseconds from compilation message
      const msMatch = data.match(/in (\d+) ms/);
      if (msMatch && msMatch[1]) {
        // Store the client compilation time
        compilationState.clientMs = parseInt(msMatch[1], 10);
        // Try to print max time if both compilations are complete
        compilationState.printMaxTime();
      }
    }
  };

  const onCompileServer = (data) => {
    bumpServerRuntimeBuildId();

    // Resolve the promise if it's the first compilation
    const serverState = getGlobalState(GLOBAL_STATE_KEYS.SERVER_FIRST_COMPILE, serverFirstCompile);
    if (!serverState?.resolved && !serverState?.rejected) {
      serverState.resolved = true;
      serverState.resolve();
      setGlobalState(GLOBAL_STATE_KEYS.SERVER_FIRST_COMPILE, serverState);
    }

    if (process.env.METEOR_PROFILE) {
      // Extract milliseconds from compilation message
      const msMatch = data.match(/in (\d+) ms/);
      if (msMatch && msMatch[1]) {
        // Store the server compilation time
        compilationState.serverMs = parseInt(msMatch[1], 10);
        // Try to print max time if both compilations are complete
        compilationState.printMaxTime();
      }
    }
  };

  return {
    clientFirstCompile,
    serverFirstCompile,
    clientFirstCompilePromise,
    serverFirstCompilePromise,
    onCompileClient,
    onCompileServer
  };
}

/**
 * Waits for first compilation to complete
 * @param {Object} clientFirstCompile - Client first compilation state
 * @param {Object} serverFirstCompile - Server first compilation state
 * @param {Promise} clientFirstCompilePromise - Promise for client first compilation
 * @param {Promise} serverFirstCompilePromise - Promise for server first compilation
 * @param {Object} options - Options for waiting
 * @param {string} options.target - Target to wait for: 'client', 'server', or 'both' (default)
 * @param {string} options.version - Specific version to wait for (optional)
 * @returns {Promise<void>} A promise that resolves when first compilation is complete
 */
export async function waitForFirstCompilation(
  clientFirstCompile, 
  serverFirstCompile, 
  clientFirstCompilePromise, 
  serverFirstCompilePromise,
  options = { target: 'both' }
) {
  const clientState = getGlobalState(GLOBAL_STATE_KEYS.CLIENT_FIRST_COMPILE, clientFirstCompile);
  const serverState = getGlobalState(GLOBAL_STATE_KEYS.SERVER_FIRST_COMPILE, serverFirstCompile);

  // If compilation is already complete, return immediately
  if (process.env.RSPACK_FIRST_COMPILATION_COMPLETE) {
    return;
  }

  // Determine which compilation(s) to wait for based on target
  switch (options.target) {
    case 'client':
      if (!clientState?.resolved) {
        await clientFirstCompilePromise;
      }
      break;
    case 'server':
      if (!serverState?.resolved) {
        await serverFirstCompilePromise;
      }
      break;
    case 'both':
    default: {
      // Wait for every side that has not compiled yet. (Using a single
      // combined condition here would skip waiting for the other side
      // as soon as one of them finished first.)
      const pending = [];
      if (!clientState?.resolved) {
        pending.push(clientFirstCompilePromise);
      }
      if (!serverState?.resolved) {
        pending.push(serverFirstCompilePromise);
      }
      if (pending.length > 0) {
        await Promise.all(pending);
      }
      break;
    }
  }

  process.env.RSPACK_FIRST_COMPILATION_COMPLETE = true;
}
