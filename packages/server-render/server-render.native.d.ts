import * as http from 'http';
import type { CategorizedRequest as WebAppCategorizedRequest } from 'meteor/webapp';

// NodeJS.ReadableStream only works on server.
// HTMLElement only works on client.
export type Content = string | Content[] | NodeJS.ReadableStream | HTMLElement;

export interface ClientSink {
  // Client and server. Only client
  appendToHead(html: Content): void;
  appendToBody(html: Content): void;
  appendToElementById(id: string, html: Content): void;
  renderIntoElementById(id: string, html: Content): void;
  redirect(location: string, code?: number): void;

  // Server-only, but error-raising stubs provided to client:
  setStatusCode(code: number): void;
  setHeader(key: string, value: number | string | string[]): void;
  getHeaders(): http.IncomingHttpHeaders;
  getCookies(): { [key: string]: string };
}

/**
 * Request metadata categorized by `WebApp` before server rendering begins.
 */
export type CategorizedRequest = WebAppCategorizedRequest;

export interface ServerSink extends ClientSink {
  // Server-only:
  request: CategorizedRequest;
  arch: string;
  head: string;
  body: string;
  htmlById: { [key: string]: string };
  maybeMadeChanges: boolean;
}

export type Sink = ClientSink | ServerSink;

export type Callback<T = void> = (sink: Sink) => Promise<T> | T;

export function onPageLoad<T extends Callback<unknown>>(callback: T): T;
export namespace onPageLoad {
  /** Unregister a previously-registered page-load callback. */
  function remove(callback: Callback<unknown>): void;
  /** Remove all registered page-load callbacks. */
  function clear(): void;
  /** Run `handler` for each registered callback, in registration order. */
  function chain(handler: (callback: Callback<unknown>) => unknown): Promise<void>;
}
