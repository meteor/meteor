import { defineConfig } from "@meteorjs/rspack";
import { createConfig } from '@nx/angular-rspack';

/**
 * Rspack configuration for Meteor projects.
 *
 * Provides typed flags on the `Meteor` object, such as:
 * - `Meteor.isClient` / `Meteor.isServer`
 * - `Meteor.isDevelopment` / `Meteor.isProduction`
 * - …and other flags available
 *
 * Use these flags to adjust your build settings based on environment.
 */
export default defineConfig(async Meteor => {
  const angularConfig = await createConfig({
    options: {
      browser: Meteor.mainClientEntry,
      index: Meteor.mainClientHtmlEntry,
    },
  });

  return {
    ...(Meteor.isClient && !Meteor.isTest && angularConfig),
  };
});
