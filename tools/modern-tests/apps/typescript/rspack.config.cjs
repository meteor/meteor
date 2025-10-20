const { defineConfig } = require('@meteorjs/rspack');
const { TsCheckerRspackPlugin } = require('ts-checker-rspack-plugin');

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
          test: /\.scss$/i,
          use: [
            {
              loader: 'sass-loader',
              options: {
                api: 'modern-compiler',
                implementation: require.resolve('sass-embedded'),
              },
            },
          ],
          type: 'css/auto',
        },
      ],
    },
    plugins: [new TsCheckerRspackPlugin()],
  };
});
