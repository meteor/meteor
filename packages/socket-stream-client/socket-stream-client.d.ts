/** Options accepted by the `ClientStream` constructor. */
interface ClientStreamOptions {
  /** Automatically reconnect on failure (default `true`). */
  retry?: boolean;
  /** Custom error constructor thrown on connection failure. */
  ConnectionError?: unknown;
  /** Extra headers sent with the connection (server-to-server only). */
  headers?: Record<string, string>;
  npmFayeOptions?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Snapshot of a stream's connection state, as returned by `status()`. */
interface StreamStatus {
  status: "connected" | "connecting" | "failed" | "waiting" | "offline";
  connected: boolean;
  retryCount: number;
  retryTime?: number;
  reason?: string;
}

/** Events a caller can subscribe to via `on`. */
type StreamEvent = "message" | "reset" | "disconnect";

/**
 * A DDP transport stream backed by SockJS/WebSocket in the browser (and a
 * faye-websocket in Node). Handles connection, reconnection and heartbeats.
 */
export class ClientStream {
  constructor(url: string, options?: ClientStreamOptions);

  /** Send a raw string message over the socket. */
  send(data: string): void;
  /** Subscribe to a stream event. */
  on(name: StreamEvent, callback: (...args: unknown[]) => void): void;
  /** Force a reconnect, optionally to a new URL. */
  reconnect(options?: { url?: string; _force?: boolean }): void;
  /** Close the connection. */
  disconnect(options?: { _permanent?: boolean; _error?: unknown }): void;
  /** Current connection status. */
  status(): StreamStatus;
}
