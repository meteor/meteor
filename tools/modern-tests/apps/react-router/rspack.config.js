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
    resolve: {
      alias: {
        '@helper/alias': '/imports/helpers/alias.js',
        '@react/alias': '/node_modules/react',
      },
      extensions: ['.jsx'],
    },
    module: {
      rules: [
        {
          test: /\.jsx$/,
          use: [
            {
              loader: 'builtin:swc-loader',
              options: { jsc: { parser: { syntax: 'ecmascript', jsx: true } } },
            },
            { loader: 'babel-loader' },
          ],
          type: 'javascript/auto',
        },
        {
          test: /\.less$/,
          use: [
            {
              loader: 'less-loader',
            },
          ],
          type: 'css/auto',
        },
      ],
    },
    plugins: [
      Meteor.HtmlRspackPlugin({
        title: 'react-router',
        meta: {
          'theme-color': '#4285f4',
        },
      }),
    ],
  };
});
