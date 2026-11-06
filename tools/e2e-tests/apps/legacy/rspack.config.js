const { defineConfig } = require('@meteorjs/rspack');
const { DefinePlugin } = require('@rspack/core');
const path = require('path');

module.exports = defineConfig(Meteor => ({
  resolve: {
    // Both the app and its legacy test entry require this conditional config.
    alias: Meteor.isLegacy
      ? { '@legacy': path.resolve(__dirname, 'imports') }
      : {},
  },
  module: {
    rules: [
      { test: /\.notice$/, use: path.resolve(__dirname, 'notice-loader.cjs') },
      { test: /\.svg$/, type: 'asset/resource' },
    ],
  },
  plugins: [new DefinePlugin({
    __BUILD_ARCH__: JSON.stringify(Meteor.arch || 'client'),
  })],
}));
