import type { PluginListenerHandle } from "@capacitor/core";

export interface MeteorCapacitorContext {
  mode: "livereload" | "bundled";
  isDevelopment: boolean;
  isProduction: boolean;
  isDebug: boolean;
  isVerbose: boolean;
  isRun: boolean;
  isBuild: boolean;
  isCapacitor: boolean;
  isNative: boolean;
  isLivereload: boolean;
  isBundled: boolean;
  isNativeAndroid: boolean;
  isNativeIos: boolean;
  platform: "android" | "ios" | "";
  buildContext: string;
  webDir: string;
  rootUrl: string;
  localIp: string;
  port: string;
}

export interface CapacitorMeteorWebAppPlugin {
  startupDidComplete(): Promise<void>;
  checkForUpdates(): Promise<void>;
  getCurrentVersion(): Promise<{ version: string }>;
  isUpdateAvailable(): Promise<{ available: boolean }>;
  reload(): Promise<void>;
  addListener(
    eventName: "updateAvailable",
    listenerFunc: (event: UpdateAvailableEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "error",
    listenerFunc: (event: WebAppErrorEvent) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export interface UpdateAvailableEvent {
  version: string;
}

export interface WebAppErrorEvent {
  message: string;
}

export enum MeteorWebAppError {
  DOWNLOAD_FAILED = "DOWNLOAD_FAILED",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  BLACKLISTED_VERSION = "BLACKLISTED_VERSION",
  STARTUP_TIMEOUT = "STARTUP_TIMEOUT",
  FILE_SYSTEM_ERROR = "FILE_SYSTEM_ERROR",
}

export interface BootCapacitorOptions {
  hideSplash?: boolean;
  defineCustomElements?: boolean;
  hcpAutoReload?: boolean;
}

export const CapacitorMeteorWebApp: CapacitorMeteorWebAppPlugin;

export function bootCapacitor(options?: BootCapacitorOptions): Promise<void>;

export function defineConfig<TConfig extends Record<string, unknown>>(
  input: TConfig | ((Meteor: MeteorCapacitorContext) => TConfig),
): TConfig;

export default defineConfig;

declare global {
  interface Window {
    WebAppLocalServer: {
      startupDidComplete(callback?: () => void): void;
      checkForUpdates(callback?: () => void): void;
      onNewVersionReady(callback: (version: string) => void): void;
      switchToPendingVersion(callback?: () => void, errorCallback?: (error: Error) => void): void;
      onError(callback: (error: Error) => void): void;
      localFileSystemUrl(fileUrl: string): never;
    };
  }
}
