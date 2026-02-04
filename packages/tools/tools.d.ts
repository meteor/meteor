/**
 * TypeScript definitions for Meteor globals.
 * - Assets: Runtime global for accessing files from the `private` directory
 * - Package, Npm, Cordova, App: Build-time globals for package.js configuration
 *
 * Adapted from DefinitelyTyped for Meteor 3.x with async/Promise-based APIs.
 */

// ============================================================================
// Assets
// ============================================================================

/**
 * The Assets namespace provides methods to access static server assets.
 * Assets are files in the `private` subdirectory of the application.
 */
export namespace Assets {
  /**
   * Retrieve the contents of the static server asset as a UTF8-encoded string.
   * @param assetPath The path of the asset, relative to the application's `private` subdirectory.
   * @param callback Optional callback for async usage. If not provided, returns a Promise.
   */
  function getTextAsync(
    assetPath: string,
    callback?: (error: Error | null, result?: string) => void
  ): Promise<string>;

  /**
   * Retrieve the contents of the static server asset as a Uint8Array.
   * @param assetPath The path of the asset, relative to the application's `private` subdirectory.
   * @param callback Optional callback for async usage. If not provided, returns a Promise.
   */
  function getBinaryAsync(
    assetPath: string,
    callback?: (error: Error | null, result?: Uint8Array) => void
  ): Promise<Uint8Array>;

  /**
   * Get the absolute path to the static server asset. Note that assets are read-only.
   * @param assetPath The path of the asset, relative to the application's `private` subdirectory.
   */
  function absoluteFilePath(assetPath: string): string;

  /**
   * Get the server directory path.
   */
  function getServerDir(): string;
}

// ============================================================================
// Npm
// ============================================================================

/**
 * The Npm namespace provides methods to manage npm dependencies in packages.
 */
export namespace Npm {
  /**
   * Specify which npm packages your Meteor package depends on.
   * @param dependencies An object where keys are package names and values are version constraints or URLs.
   */
  function depends(dependencies: { [packageName: string]: string }): void;

  /**
   * Require a npm module from within a package.
   * @param moduleName The name of the npm module to require.
   */
  function require(moduleName: string): any;
}

// ============================================================================
// Package
// ============================================================================

/**
 * Options for Package.describe()
 */
export interface PackageDescribeOptions {
  /** A concise 1-2 sentence description of the package. */
  summary?: string;
  /** The version of the package. */
  version?: string;
  /** The name of the package. Optional if inferred from directory name. */
  name?: string;
  /** The URL to the Git repository containing the source code. */
  git?: string;
  /** The file to use for documentation (defaults to README.md). Set to null to disable. */
  documentation?: string | null;
  /** Set to true to prevent this package from being published. */
  debugOnly?: boolean;
  /** Set to true for packages only used in production. */
  prodOnly?: boolean;
  /** Set to true for packages only used for testing. */
  testOnly?: boolean;
}

/**
 * Options for Package.registerBuildPlugin()
 */
export interface BuildPluginOptions {
  /** The name of the build plugin. */
  name: string;
  /** Which packages the build plugin uses. */
  use?: string[];
  /** Source files for the build plugin. */
  sources?: string[];
  /** npm dependencies for the build plugin. */
  npmDependencies?: { [packageName: string]: string };
}

/**
 * The Package namespace provides methods for defining Meteor packages.
 */
export namespace Package {
  /**
   * Provide basic package information.
   * @param options Package metadata options.
   */
  function describe(options: PackageDescribeOptions): void;

  /**
   * Define package dependencies and add source files.
   * @param func A function that receives a PackageAPI object.
   */
  function onUse(func: (api: PackageAPI) => void): void;

  /**
   * Define dependencies and source files for tests.
   * @param func A function that receives a PackageAPI object.
   */
  function onTest(func: (api: PackageAPI) => void): void;

  /**
   * Register a build plugin.
   * @param options Build plugin configuration.
   */
  function registerBuildPlugin(options: BuildPluginOptions): void;
}

// ============================================================================
// PackageAPI
// ============================================================================

/**
 * Options for api.use() and api.imply()
 */
export interface DependencyOptions {
  /** Use this package only on specific architectures. */
  weak?: boolean;
  /** This dependency is unordered. */
  unordered?: boolean;
}

/**
 * Options for api.addFiles()
 */
export interface AddFilesOptions {
  /** If true, don't wrap the file in a closure. */
  bare?: boolean;
}

/**
 * The API object passed to Package.onUse and Package.onTest.
 */
export interface PackageAPI {
  /**
   * Declare which Meteor release this package is compatible with.
   * @param releases One or more Meteor release strings.
   */
  versionsFrom(releases: string | string[]): void;

  /**
   * Declare dependencies on other packages.
   * @param packages Package names with optional version constraints.
   * @param architecture Optional architecture(s): 'client', 'server', 'web', 'web.browser', 'web.cordova'.
   * @param options Optional dependency options.
   */
  use(
    packages: string | string[],
    architecture?: string | string[],
    options?: DependencyOptions
  ): void;

  /**
   * Give users of this package access to another package without explicitly depending on it.
   * @param packages Package names to imply.
   * @param architecture Optional architecture(s).
   */
  imply(packages: string | string[], architecture?: string | string[]): void;

  /**
   * Export symbols from this package.
   * @param symbols Symbol names to export.
   * @param architecture Optional architecture(s).
   * @param options Optional export options.
   */
  export(
    symbols: string | string[],
    architecture?: string | string[],
    options?: { testOnly?: boolean }
  ): void;

  /**
   * Add source files to the package.
   * @param filenames File paths relative to the package directory.
   * @param architecture Optional architecture(s).
   * @param options Optional file options.
   */
  addFiles(
    filenames: string | string[],
    architecture?: string | string[],
    options?: AddFilesOptions
  ): void;

  /**
   * Add asset files to the package.
   * @param filenames File paths relative to the package directory.
   * @param architecture Architecture(s) where assets are available.
   */
  addAssets(filenames: string | string[], architecture: string | string[]): void;

  /**
   * Specify the main module for the package.
   * @param filename The main module file path.
   * @param architecture Optional architecture(s).
   * @param options Optional options.
   */
  mainModule(
    filename: string,
    architecture?: string | string[],
    options?: { lazy?: boolean }
  ): void;
}

// ============================================================================
// App (Mobile Configuration)
// ============================================================================

/**
 * Options for App.info()
 */
export interface AppInfoOptions {
  /** The app identifier (reverse domain style). */
  id?: string;
  /** The app version string. */
  version?: string;
  /** The app name. */
  name?: string;
  /** A short description of the app. */
  description?: string;
  /** The author's name. */
  author?: string;
  /** The author's email. */
  email?: string;
  /** The app's website URL. */
  website?: string;
}

/**
 * Options for App.accessRule()
 */
export interface AppAccessRuleOptions {
  /** The type of access: 'intent', 'navigation', 'network'. */
  type?: string;
  /** Whether to allow launching external apps. */
  launchExternal?: boolean;
}

/**
 * The App namespace provides methods for mobile app configuration.
 */
export namespace App {
  /**
   * Set app metadata.
   * @param options App information options.
   */
  function info(options: AppInfoOptions): void;

  /**
   * Set a preference value for the Cordova config.xml.
   * @param name The preference name.
   * @param value The preference value.
   * @param platform Optional platform: 'android', 'ios'.
   */
  function setPreference(name: string, value: string, platform?: string): void;

  /**
   * Configure a Cordova plugin.
   * @param id The plugin ID.
   * @param config Configuration object for the plugin.
   */
  function configurePlugin(id: string, config: { [key: string]: any }): void;

  /**
   * Specify app icons.
   * @param icons Object mapping size strings to icon file paths.
   */
  function icons(icons: { [size: string]: string }): void;

  /**
   * Specify launch screen images.
   * @param launchScreens Object mapping size/orientation strings to image file paths.
   */
  function launchScreens(launchScreens: { [size: string]: string }): void;

  /**
   * Define URL access rules for the app.
   * @param pattern The URL pattern to allow.
   * @param options Optional access rule options.
   */
  function accessRule(pattern: string, options?: AppAccessRuleOptions): void;
}

// ============================================================================
// Cordova
// ============================================================================

/**
 * The Cordova namespace provides methods for Cordova plugin dependencies.
 */
export namespace Cordova {
  /**
   * Specify Cordova plugin dependencies.
   * @param dependencies Object mapping plugin IDs to version constraints or URLs.
   */
  function depends(dependencies: { [pluginId: string]: string }): void;
}

// ============================================================================
// Global declarations for ambient usage
// ============================================================================

declare global {
  const Assets: typeof import("meteor/tools").Assets;
  const Npm: typeof import("meteor/tools").Npm;
  const Package: typeof import("meteor/tools").Package;
  const App: typeof import("meteor/tools").App;
  const Cordova: typeof import("meteor/tools").Cordova;
}
