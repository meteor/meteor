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
   */
  HtmlRspackPlugin: (options?: HtmlRspackPluginOptions) => HtmlRspackPlugin;
  /**
   * Wrap externals for Meteor runtime.
   * @param deps - Package names or module IDs
   * @returns A config object with externals configuration
   */
  compileWithMeteor: (deps: RuleSetConditions) => Record<string, object>;
  /**
   * Add SWC transpilation rules limited to specific deps (monorepo-friendly).
   * @param deps - Package names to include in SWC loader
   * @param options - Optional configuration options
   * @returns A config object with module rules configuration
   */
  compileWithRspack: (deps: RuleSetConditions, options?: SwcLoaderOptions) => Record<string, object>;
  /**
   * Enable or disable Rspack cache config.
   * @param enabled - Whether to enable caching
   * @param cacheConfig - Optional cache configuration
   * @returns A config object with cache configuration
   */
  setCache: (enabled: boolean | 'memory') => Record<string, object>;
  /**
   * Enable Rspack split vendor chunk.
   * @returns A config object with optimization configuration
   */
  splitVendorChunk: () => Record<string, object>;
  /**
   * Extend Rspack SWC loader config.
   * @returns A config object with SWC loader config
   */
  extendSwcConfig: (swcConfig: SwcLoaderOptions) => Record<string, object>;
  /**
   * Extend Rspack configs.
   * @returns A config object with merged configs
   */
  extendConfig: (...configs: Record<string, object>[]) => Record<string, object>;
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
