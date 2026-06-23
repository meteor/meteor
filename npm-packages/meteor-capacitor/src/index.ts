/*
 * Vendored from https://github.com/banjerluke/capacitor-meteor-webapp
 * Copyright 2025 Luke Abbott. MIT license. See LICENSES/banjerluke-capacitor-meteor-webapp.txt.
 */

import { registerPlugin } from '@capacitor/core';

import type { CapacitorMeteorWebAppPlugin } from './definitions';

const CapacitorMeteorWebApp = registerPlugin<CapacitorMeteorWebAppPlugin>('CapacitorMeteorWebApp', {
  web: () => import('./web').then((m) => new m.CapacitorMeteorWebAppWeb()),
});

export * from './definitions';
export { CapacitorMeteorWebApp };
