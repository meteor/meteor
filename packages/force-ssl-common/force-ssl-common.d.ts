/** The subset of a Node HTTP request these helpers inspect. */
interface ConnectionRequest {
  headers?: Record<string, string | string[] | undefined>;
  connection?: { remoteAddress?: string; [key: string]: unknown };
  socket?: { remoteAddress?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** Whether the request originated from a loopback / local address. */
export function isLocalConnection(req: ConnectionRequest): boolean;

/** Whether the request reached the server over a secure (TLS) connection. */
export function isSslConnection(req: ConnectionRequest): boolean;
