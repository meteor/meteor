/**
 * Extend Rspack’s Configuration with Meteor-specific options.
 */
import {
  defineConfig as _rspackDefineConfig,
  Configuration as _RspackConfig,
} from '@rspack/cli';
import { HtmlRspackPluginOptions, RuleSetConditions, SwcLoaderOptions } from '@rspack/core';

export interface MeteorRspackConfig extends _RspackConfig {
  meteor?: {
    packageNamespace?: string;
  };
}

type MeteorEnv = Record<string, any> & {
  isDevelopment: boolean;
  isProduction: boolean;
  isClient: boolean;
  isServer: boolean;
  isTest: boolean;
  isDebug: boolean;
  isRun: boolean;
  isBuild: boolean;
  isReactEnabled: boolean;
  isBlazeEnabled: boolean;
  isBlazeHotEnabled: boolean;
  /**
   * A function that creates an instance of HtmlRspackPlugin with default options.
   * @param options - Optional configuration options that will be merged with defaults
   * @returns An instance of HtmlRspackPlugin
   * @example Meteor.HtmlRspackPlugin({ title: 'My App' })
   */
  HtmlRspackPlugin: (options?: HtmlRspackPluginOptions) => HtmlRspackPlugin;
  /**
   * Wrap externals for Meteor runtime.
   * @param deps - Package names or module IDs
   * @returns A config object with externals configuration
   * @example ...Meteor.compileWithMeteor(['sharp', 'thread-stream'])
   */
  compileWithMeteor: (deps: RuleSetConditions) => Record<string, object>;
  /**
   * Add SWC transpilation rules limited to specific deps (monorepo-friendly).
   * @param deps - Package names to include in SWC loader
   * @param options - Optional configuration options
   * @returns A config object with module rules configuration
   * @example ...Meteor.compileWithRspack(['grubba-rpc', 'zod'])
   */
  compileWithRspack: (deps: RuleSetConditions, options?: SwcLoaderOptions) => Record<string, object>;
  /**
   * Enable or disable Rspack cache config.
   * @param enabled - Whether to enable caching
   * @param cacheConfig - Optional cache configuration
   * @returns A config object with cache configuration
   * @example ...Meteor.setCache(false)
   */
  setCache: (enabled: boolean | 'memory') => Record<string, object>;
  /**
   * Enable Rspack split vendor chunk.
   * @returns A config object with optimization configuration
   * @example ...Meteor.splitVendorChunk()
   */
  splitVendorChunk: () => Record<string, object>;
  /**
   * Extend the SWC loader config by smart-merging custom options on top of
   * Meteor's defaults. Only the properties you specify are overridden;
   * everything else is preserved.
   * @param swcConfig - SWC loader options to merge with defaults
   * @returns A config object with SWC loader config
   * @example ...Meteor.extendSwcConfig({ jsc: { parser: { decorators: true } } })
   */
  extendSwcConfig: (swcConfig: SwcLoaderOptions) => Record<string, object>;
  /**
   * Replace the SWC loader config entirely, discarding Meteor's defaults.
   * @param swcConfig - Complete SWC loader options (replaces defaults)
   * @returns A config object with SWC loader config
   * @example ...Meteor.replaceSwcConfig({ jsc: { target: 'es2020' } })
   */
  replaceSwcConfig: (swcConfig: SwcLoaderOptions) => Record<string, object>;
  /**
   * Extend Rspack configs.
   * @returns A config object with merged configs
   * @example ...Meteor.extendConfig(configA, configB)
   */
  extendConfig: (...configs: Record<string, object>[]) => Record<string, object>;

  /**
   * Remove plugins from a Rspack config by name, RegExp, predicate, or array of them.
   * @param matchers - String, RegExp, function, or array of them to match plugin names
   * @returns The modified config object
   * @example ...Meteor.disablePlugins(['DefinePlugin', /HtmlRspack/])
   */
  disablePlugins: (
    matchers: string | RegExp | ((plugin: any, index: number) => boolean) | Array<string | RegExp | ((plugin: any, index: number) => boolean)>
  ) => Record<string, any>;
  /**
   * Omit `Meteor.isDevelopment` and `Meteor.isProduction` from the DefinePlugin so
   * the bundle is not tied to a specific Meteor environment (portable builds).
   * @returns A config fragment with `meteor.enablePortableBuild: true`
   * @example ...Meteor.enablePortableBuild()
   */
  enablePortableBuild: () => Record<string, any>;
  /**
   * Persist build-output files to disk during development.
   * HTML files are always persisted automatically.
   *
   * Matchers: `string` (endsWith), `RegExp`, or `(filePath) => boolean`.
   * Array form defaults to `always`. Object form supports `once` and `always`.
   * - `always` — written on every build (default)
   * - `once` — first build only (e.g. service workers)
   *
   * @param matchers - Array or `{ once?, always? }` of matchers
   * @returns A config fragment with `devServer.devMiddleware.writeToDisk`
   *
   * @example
   * ...Meteor.persistDevFiles({ once: ['sw.js'], always: ['manifest.json'] })
   */
  persistDevFiles: (
    matchers:
      | (string | RegExp | ((filePath: string) => boolean))[]
      | {
          /** Files written on the first build only. */
          once?: (string | RegExp | ((filePath: string) => boolean))[];
          /** Files written on every build. */
          always?: (string | RegExp | ((filePath: string) => boolean))[];
        }
  ) => Record<string, object>;
}

export type ConfigFactory = (
  env: MeteorEnv,
  argv: Record<string, any>
) => MeteorRspackConfig;

export function defineConfig(
  factory: ConfigFactory
): ReturnType<typeof _rspackDefineConfig>;

/**
 * A plugin that composes the original HtmlRspackPlugin from @rspack/core
 * and RspackMeteorHtmlPlugin, in that order.
 */
export class HtmlRspackPlugin {
  constructor(options?: HtmlRspackPluginOptions);
  apply(compiler: any): void;
}

// Re-export HtmlRspackPluginOptions from @rspack/cli
export { HtmlRspackPluginOptions };
