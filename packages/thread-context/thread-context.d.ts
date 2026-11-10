import { MessagePort } from 'worker_threads';

// --- Error Classes ---

export class BridgeError extends Error {
  name: string;
}

export class BridgeTimeoutError extends BridgeError {}
export class BridgeSerializationError extends BridgeError {}
export class BridgeContextError extends BridgeError {}

export class MeteorError extends Error {
  constructor(error: string | number, reason?: string, details?: string);
  isClientSafe: boolean;
  error: string | number;
  reason?: string;
  details?: string;
}

// --- Error Serialization ---

export function serializeError(err: Error): {
  type: string;
  message: string;
  stack?: string;
  meteorError?: string | number;
  reason?: string;
  details?: string;
};

export function deserializeError(obj: {
  type: string;
  message: string;
  stack?: string;
  meteorError?: string | number;
  reason?: string;
  details?: string;
}): Error;

// --- Bridge Context ---

interface ThreadContextOptions {
  userId?: string | null;
  connectionId?: string | null;
  callTimeout?: number;
  onMessage?: (msg: BridgeMessage) => any | Promise<any>;
  onResult?: (msg: BridgeMessage, result: any) => any | Promise<any>;
}

/**
 * Structured-clone-safe bundle to pass as a Worker's `workerData`
 * (list `port` in `transferList`). `hydrateContext` accepts it as-is.
 */
interface ThreadWorkerData {
  port: MessagePort;
  settings: Readonly<Record<string, any>>;
  userId: string | null;
  connectionId: string | null;
  callTimeout: number;
  /**
   * `file://` URL of the worker-side entry module shipped with the package.
   * A worker has no Meteor module system; load the API with
   * `await import(workerData.bridgeModuleUrl)`. The entry exports
   * `hydrateContext` and the error classes.
   */
  bridgeModuleUrl: string;
}

interface ThreadContext extends ThreadWorkerData {
  workerData: ThreadWorkerData;
  /**
   * Closes the bridge. The host also destroys itself when the worker's port
   * closes, so calling this on worker exit is optional.
   */
  destroy(): void;
}

interface BridgeMessage {
  v: 1;
  id: string;
  type: string;
  collectionName?: string;
  op?: string;
  args?: any[];
  methodName?: string;
  methodArgs?: any[];
}

export function createThreadContext(options?: ThreadContextOptions): ThreadContext;

// --- Bridge Infrastructure ---

export class BridgeHost {
  constructor(options?: ThreadContextOptions);
  port: MessagePort;
  transferPort: MessagePort;
  context: { userId: string | null; connectionId: string | null };
  callTimeout: number;
  destroyed: boolean;
  registerHandler(type: string, handler: { handle(msg: BridgeMessage): Promise<any> }): void;
  destroy(): void;
}

export class BridgeClient {
  constructor(port: MessagePort, options?: { callTimeout?: number });
  port: MessagePort;
  call(msg: { type: string; [key: string]: any }): Promise<any>;
}

// --- Handlers ---

export class CollectionHandler {
  constructor(context: { userId: string | null; connectionId: string | null });
  handle(msg: BridgeMessage): Promise<any>;
}

export class MethodHandler {
  constructor(context: { userId: string | null; connectionId: string | null });
  handle(msg: BridgeMessage): Promise<any>;
}

// --- Proxy Factories ---

export function createCollectionProxy(client: BridgeClient): CollectionsProxy;
export function createMethodProxy(client: BridgeClient): {
  callAsync(methodName: string, ...args: any[]): Promise<any>;
};
export function createConnectionProxy(connectionId: string | null): { readonly id: string | null };
export function createBridgeInvocation(context: {
  userId: string | null;
  connectionId: string | null;
}, name: string): any;

// --- Worker-Side ---

interface HydrateOptions {
  settings?: Record<string, any>;
  userId?: string | null;
  callTimeout?: number;
}

interface HydratedMeteor {
  callAsync(methodName: string, ...args: any[]): Promise<any>;
  settings: Readonly<Record<string, any>>;
  /** Returns the forwarded userId; same call shape as `Meteor.userId()` on the host. */
  userId(): string | null;
  isServer: true;
  isSimulation: false;
  isClient: false;
  Error: typeof MeteorError;
}

interface CursorProxy {
  fetchAsync(): Promise<any[]>;
  countAsync(): Promise<number>;
  forEachAsync(callback: (doc: any) => void | Promise<void>): Promise<void>;
  mapAsync<T>(callback: (doc: any) => T | Promise<T>): Promise<T[]>;
  observe(callbacks: any): never;
  observeChanges(callbacks: any): never;
}

interface CollectionProxy {
  find(selector?: any, options?: any): CursorProxy;
  findOneAsync(selector?: any, options?: any): Promise<any>;
  insertAsync(doc: any): Promise<string>;
  updateAsync(selector: any, modifier: any, options?: any): Promise<number>;
  removeAsync(selector: any): Promise<number>;
  upsertAsync(selector: any, modifier: any, options?: any): Promise<{ numberAffected: number; insertedId?: string }>;
  aggregate(pipeline: any[], options?: any): Promise<any[]>;
}

interface CollectionsProxy {
  [collectionName: string]: CollectionProxy;
}

interface HydratedContext {
  Collections: CollectionsProxy;
  Meteor: HydratedMeteor;
}

export function hydrateContext(port: MessagePort, options?: HydrateOptions): HydratedContext;
export function hydrateContext(workerData: ThreadWorkerData, options?: HydrateOptions): HydratedContext;

// --- Shutdown ---

export function getActiveBridgeCount(): number;
export function destroyAllBridges(): void;
export function installShutdownHandlers(options?: { exit?: boolean }): void;
export function resetSettingsSnapshot(): void;
