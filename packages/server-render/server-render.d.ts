import * as http from 'http';

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
 * Meteor parses the user agent string in an attempt to identify the browser.
 * This is used, for example, to determine whether to serve the modern
 * or the legacy bundle, in case your app uses both..
 */
type IdentifiedBrowser = {
  name: string;
  major: number;
  minor: number;
  patch: number;
}

/**
 * A categorized request is an IncomingMessage with a pre-parsed URL,
 * and additional properties added by Meteor.
 */
export type CategorizedRequest = Omit<http.IncomingMessage, 'url'> & {
  browser: IdentifiedBrowser;
  dynamicHead: string | undefined;
  dynamicBody: string | undefined;
  modern: boolean;
  path: string;
  url: URL;
}

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

export type Callback = (sink: Sink) => Promise<any> | any;

export function onPageLoad<T extends Callback>(callback: T): T;
