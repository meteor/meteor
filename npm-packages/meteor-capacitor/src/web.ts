/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

import { WebPlugin } from '@capacitor/core';

import type { CapacitorMeteorWebAppPlugin } from './definitions';

export class CapacitorMeteorWebAppWeb extends WebPlugin implements CapacitorMeteorWebAppPlugin {
  async startupDidComplete(): Promise<void> {
    console.warn('CapacitorMeteorWebApp.startupDidComplete() is not available on web platform');
  }

  async checkForUpdates(): Promise<void> {
    console.warn('CapacitorMeteorWebApp.checkForUpdates() is not available on web platform');
  }

  async getCurrentVersion(): Promise<{ version: string }> {
    console.warn('CapacitorMeteorWebApp.getCurrentVersion() is not available on web platform');
    return { version: '1.0.0' };
  }

  async isUpdateAvailable(): Promise<{ available: boolean }> {
    console.warn('CapacitorMeteorWebApp.isUpdateAvailable() is not available on web platform');
    return { available: false };
  }

  async reload(): Promise<void> {
    console.warn('CapacitorMeteorWebApp.reload() is not available on web platform');
    window.location.reload();
  }
}
