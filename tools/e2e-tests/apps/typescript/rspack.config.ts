import { defineConfig } from '@meteorjs/rspack';
import { createRequire } from 'node:module';
import { TsCheckerRspackPlugin } from 'ts-checker-rspack-plugin';
import type { Configuration } from '@rspack/core';

const require = createRequire(import.meta.url);

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
// Satisfy TS noUnusedLocals without affecting the return type of defineConfig
export type _Config = Configuration;

export default defineConfig(Meteor => {
  return {
    ...Meteor.enablePortableBuild(),
    ...Meteor.extendSwcConfig({
      jsc: {
        baseUrl: process.cwd(),
        paths: {
          '@ui/*': ['imports/ui/*'],
          '@api/*': ['imports/api/*'],
        },
      },
    }),
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
