const { defineConfig } = require('@meteorjs/rspack');

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
module.exports = defineConfig(Meteor => {
  return {
    module: {
      rules: [
        {
          test: /\.coffee$/i,
          use: [
            {
              loader: 'swc-loader',
              // preserve SWC config in the Meteor project level
              options: Meteor.swcConfigOptions,
            },
            {
              loader: 'coffee-loader',
            },
          ],
        },
      ],
    },
    resolve: {
      extensions: ['.coffee'],
    },
  };
});
