export namespace HTTP {
  export interface HTTPRequest {
    content?: string;
    data?: unknown;
    query?: string;
    params?: Record<string, unknown>;
    auth?: string;
    headers?: Record<string, string>;
    timeout?: number;
    followRedirects?: boolean;
    beforeSend?: (
      request: XMLHttpRequest,
      options: HTTPRequest
    ) => boolean | void;
    referrer?: string;
    integrity?: string;
  }

  export interface HTTPResponse {
    statusCode?: number;
    headers?: Record<string, string>;
    content?: string;
    data?: unknown;
    ok?: boolean;
    redirected?: boolean;
  }

  export type AsyncCallback = (
    error: Error | null | undefined,
    result?: HTTPResponse
  ) => void;

  export function call(
    method: string,
    url: string,
    options?: HTTPRequest
  ): Promise<HTTPResponse>;
  export function call(
    method: string,
    url: string,
    callback: AsyncCallback
  ): void;
  export function call(
    method: string,
    url: string,
    options: HTTPRequest,
    callback: AsyncCallback
  ): void;

  export function get(url: string, options?: HTTPRequest): Promise<HTTPResponse>;
  export function get(url: string, callback: AsyncCallback): void;
  export function get(url: string, options: HTTPRequest, callback: AsyncCallback): void;

  export function post(url: string, options?: HTTPRequest): Promise<HTTPResponse>;
  export function post(url: string, callback: AsyncCallback): void;
  export function post(url: string, options: HTTPRequest, callback: AsyncCallback): void;

  export function put(url: string, options?: HTTPRequest): Promise<HTTPResponse>;
  export function put(url: string, callback: AsyncCallback): void;
  export function put(url: string, options: HTTPRequest, callback: AsyncCallback): void;

  export function del(url: string, options?: HTTPRequest): Promise<HTTPResponse>;
  export function del(url: string, callback: AsyncCallback): void;
  export function del(url: string, options: HTTPRequest, callback: AsyncCallback): void;

  export function patch(url: string, options?: HTTPRequest): Promise<HTTPResponse>;
  export function patch(url: string, callback: AsyncCallback): void;
  export function patch(url: string, options: HTTPRequest, callback: AsyncCallback): void;
}

export const HTTPInternals: Record<string, unknown>;
