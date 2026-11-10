import "meteor/meteor";
import type { IncomingMessage, ServerResponse } from "http";
import type { CategorizedRequest } from "meteor/webapp";

declare module "meteor/meteor" {
  namespace Meteor {
    /** True in a Capacitor native WebView; false on the server and in a browser. */
    var isCapacitor: boolean;
  }
}

/** Client only. Detects Capacitor's native platform within Meteor's mobile runtime. */
export function detectIsCapacitorRuntime(runtime?: unknown): boolean;

/** Server only. Whether the native app loads directly from the development server. */
export function isCapacitorDirectServerMode(env?: NodeJS.ProcessEnv): boolean;
/** Server only. User-agent marker used by Capacitor's livereload WebView. */
export function getCapacitorLivereloadUserAgentToken(): string;
/** Server only. Identifies a livereload WebView request. */
export function isCapacitorLivereloadRequest(
  request: Pick<IncomingMessage, "headers"> | null | undefined,
  env?: NodeJS.ProcessEnv,
): boolean;
/** Server only. Selects the mobile bundle for a livereload WebView request. */
export function detectCapacitorClientArch(
  request: IncomingMessage,
  categorizedRequest: CategorizedRequest,
  options?: { env?: NodeJS.ProcessEnv },
): "web.cordova" | null;
/** Server only. Provides the Cordova compatibility stub in livereload mode. */
export function getCordovaJsStub(env?: NodeJS.ProcessEnv): string | null;
/** Server only. Adds the native Hot Code Push bridge to mobile boilerplate. */
export function injectWebAppLocalServerShim(
  request: IncomingMessage | CategorizedRequest,
  data: { head?: string },
  arch: string,
  response?: ServerResponse,
  options?: { env?: NodeJS.ProcessEnv },
): boolean;
