/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

import type { PluginListenerHandle } from '@capacitor/core';

export interface CapacitorMeteorWebAppPlugin {
  /**
   * Signal that the app startup has completed
   */
  startupDidComplete(): Promise<void>;

  /**
   * Check for available updates from the Meteor server
   */
  checkForUpdates(): Promise<void>;

  /**
   * Get the current version of the app
   */
  getCurrentVersion(): Promise<{ version: string }>;

  /**
   * Check if an update is available
   */
  isUpdateAvailable(): Promise<{ available: boolean }>;

  /**
   * Reload the app with the latest version
   */
  reload(): Promise<void>;

  /**
   * Listen for update available events
   */
  addListener(
    eventName: 'updateAvailable',
    listenerFunc: (event: UpdateAvailableEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Listen for error events (download failures, etc.)
   */
  addListener(
    eventName: 'error',
    listenerFunc: (event: WebAppErrorEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Remove all listeners
   */
  removeAllListeners(): Promise<void>;
}

export interface UpdateAvailableEvent {
  version: string;
}

export interface WebAppErrorEvent {
  message: string;
}

export enum MeteorWebAppError {
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  BLACKLISTED_VERSION = 'BLACKLISTED_VERSION',
  STARTUP_TIMEOUT = 'STARTUP_TIMEOUT',
  FILE_SYSTEM_ERROR = 'FILE_SYSTEM_ERROR',
}

declare global {
  interface Window {
    WebAppLocalServer: {
      startupDidComplete(callback?: () => void): void;
      checkForUpdates(callback?: () => void): void;
      onNewVersionReady(callback: (version: string) => void): void;
      switchToPendingVersion(callback?: () => void, errorCallback?: (error: Error) => void): void;
      onError(callback: (error: Error) => void): void;
      localFileSystemUrl(fileUrl: string): never;
    };
  }
}
