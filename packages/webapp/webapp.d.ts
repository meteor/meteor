import * as http from "http";
import * as express from "express";

export interface StaticFiles {
  [key: string]: {
    content?: string | undefined;
    absolutePath: string;
    cacheable: boolean;
    hash: string;
    sourceMapUrl?: string | undefined;
    type: string;
  };
}

type ExpressModule = {
  (): express.Application;
  json: typeof express.json;
  raw: typeof express.raw;
  Router: typeof express.Router;
  static: typeof express.static;
  text: typeof express.text;
  urlencoded: typeof express.urlencoded;
};

export declare namespace WebApp {
  var defaultArch: string;
  var clientPrograms: {
    [key: string]: {
      format: string;
      manifest: Record<string, unknown>[];
      version: string;
      cordovaCompatibilityVersions?: Record<string, string>;
      PUBLIC_SETTINGS: Record<string, unknown>;
    };
  };
  /**
   * @deprecated use handlers instead
   */
  var connectHandlers: express.Application;
  var handlers: express.Application;
  /**
   * @deprecated use rawHandlers instead
   */
  var rawConnectHandlers: express.Application;
  var rawHandlers: express.Application;
  var httpServer: http.Server;
  var expressApp: express.Application;
  var express: ExpressModule;
  /**
   * Should be used only for testing
   * @deprecated use _suppressExpressErrors instead
   */
  function suppressConnectErrors(): void;
  /**
   * Should be used only for testing
   */
  function _suppressExpressErrors(): void;
  function onListening(callback: () => void): void;

  type RuntimeConfigHookCallback = (options: {
    arch: "web.browser" | "web.browser.legacy" | "web.cordova";
    request: http.IncomingMessage;
    encodedCurrentConfig: string;
    updated: boolean;
  }) => string | undefined | null | false;
  function addRuntimeConfigHook(callback: RuntimeConfigHookCallback): { stop: () => void; callback: RuntimeConfigHookCallback };
  function decodeRuntimeConfig(rtimeConfigString: string): unknown;
  function encodeRuntimeConfig(rtimeConfig: unknown): string;
  function addHtmlAttributeHook(hook: (request: http.IncomingMessage) => Record<string, unknown> | null): void;
}

export declare namespace WebAppInternals {
  var NpmModules: {
    [key: string]: {
      version: string;
      module: unknown;
    };
  };
  function identifyBrowser(userAgentString: string): {
    name: string;
    major: number;
    minor: number;
    patch: number;
  };
  function registerBoilerplateDataCallback(
    key: string,
    callback: Function | null
  ): Function | null;
  function generateBoilerplateInstance(
    arch: string,
    manifest: Record<string, unknown>[],
    additionalOptions: Record<string, unknown>
  ): unknown;

  function staticFilesMiddleware(
    staticFiles: StaticFiles,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: Function
  ): void;
  function parsePort(port: string | number): string | number;
  function reloadClientPrograms(): Promise<void>;
  function generateBoilerplate(): Promise<void>;
  var staticFilesByArch: { [arch: string]: StaticFiles };
  function inlineScriptsAllowed(): boolean;
  function setInlineScriptsAllowed(inlineScriptsAllowed: boolean): Promise<void>;

  function setBundledJsCssUrlRewriteHook(hookFn: (url: string) => string): Promise<void>;
  function setBundledJsCssPrefix(bundledJsCssPrefix: string): Promise<void>;
  function addStaticJs(contents: string): void;
  function getBoilerplate(request: http.IncomingMessage, arch: string): Promise<{
    stream: NodeJS.ReadableStream;
    statusCode?: number;
    headers?: Record<string, string>;
  }>;
  var additionalStaticJs: Record<string, string>;
}
