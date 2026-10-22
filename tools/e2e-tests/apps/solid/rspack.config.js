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
    ...Meteor.isClient && {
      module: {
        rules: [
          {
            test: /\.jsx$/,
            use: [
              {
                loader: 'babel-loader',
                options: {
                  presets: [['solid']],
                  plugins: ['solid-refresh/babel'],
                },
              },
            ],
          },
          {
            test: /\.svg$/,
            type: 'asset/resource',
          },
        ],
      },
    }
  };
});
