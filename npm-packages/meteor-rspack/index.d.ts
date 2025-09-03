/**
 * Extend Rspack’s Configuration with Meteor-specific options.
 */
import {
  defineConfig as _rspackDefineConfig,
  Configuration as _RspackConfig,
} from '@rspack/cli';
import { HtmlRspackPluginOptions } from '@rspack/core';

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
