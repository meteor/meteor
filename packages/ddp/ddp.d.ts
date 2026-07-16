import { Meteor } from 'meteor/meteor';
import { EJSONable } from 'meteor/ejson';

export namespace DDP {
  interface DDPStatic {
    subscribe(name: string, ...rest: EJSONable[]): Meteor.SubscriptionHandle;
    call<Result = unknown>(method: string, ...parameters: EJSONable[]): Result;
    callAsync<Result = unknown>(method: string, ...parameters: EJSONable[]): Promise<Result>;
    apply<Result = unknown>(method: string, args: EJSONable[], options?: unknown, callback?: (err: Error | undefined, result?: Result) => void): Result;
    methods(methods: Record<string, (this: DDPCommon.MethodInvocation, ...args: unknown[]) => unknown>): void;
    status(): DDPStatus;
    reconnect(): void;
    disconnect(): void;
    onReconnect(callback: (connection: DDPStatic) => void | Promise<void>): {
      stop(): void;
    };
  }

  function _allSubscriptionsReady(): boolean;

  type Status = 'connected' | 'connecting' | 'failed' | 'waiting' | 'offline';

  interface DDPStatus {
    connected: boolean;
    status: Status;
    retryCount: number;
    retryTime?: number | undefined;
    reason?: string | undefined;
  }

  function connect(url: string): DDPStatic;
}

export namespace DDPCommon {
  interface MethodInvocationOptions {
    userId: string | null;
    setUserId?: ((newUserId: string) => void) | undefined;
    isSimulation: boolean;
    connection: Meteor.Connection;
    randomSeed: string;
  }

  /** The state for a single invocation of a method, referenced by this inside a method definition. */
  interface MethodInvocation {
    new (options: MethodInvocationOptions): MethodInvocation;
    /**
     * Call inside a method invocation.  Allow subsequent method from this client to begin running in a new fiber.
     */
    unblock(): void;
    /**
     * Set the logged in user.
     * @param userId The value that should be returned by `userId` on this connection.
     */
    setUserId(userId: string | null): Promise<void>;
    /**
     * The id of the user that made this method call, or `null` if no user was logged in.
     */
    userId: string | null;
    /**
     * Access inside a method invocation.  Boolean value, true if this invocation is a stub.
     */
    isSimulation: boolean;
    /**
     * Access inside a method invocation. The [connection](#meteor_onconnection) that this method was received on. `null` if the method is not associated with a connection, eg. a server
     * initiated method call. Calls to methods made from a server method which was in turn initiated from the client share the same `connection`.
     */
    connection: Meteor.Connection;
  }

  /** Supported DDP protocol versions, newest first. */
  const SUPPORTED_DDP_VERSIONS: string[];

  /** Parse a raw DDP wire string into a message object, or `null` if invalid. */
  function parseDDP(stringMessage: string): Record<string, unknown> | null;

  /** Serialize a DDP message object to its wire string. */
  function stringifyDDP(msg: Record<string, unknown>): string;

  /** Derive the deterministic random seed used by a method stub. */
  function makeRpcSeed(enclosing: MethodInvocation, methodName: string): unknown;

  /** Options for constructing a `Heartbeat`. */
  interface HeartbeatOptions {
    heartbeatInterval: number;
    heartbeatTimeout: number;
    onTimeout: () => void;
    sendPing: () => void;
  }

  /** Client/server heartbeat used to detect dropped DDP connections. */
  interface Heartbeat {
    new (options: HeartbeatOptions): Heartbeat;
    /** Begin sending pings and watching for timeouts. */
    start(): void;
    /** Stop all heartbeat timers. */
    stop(): void;
    /** Reset the timeout timer after any message is received. */
    messageReceived(): void;
  }

  /** A deterministic, seeded source of `Random` generators. */
  interface RandomStream {
    new (options: { seed?: string | string[] }): RandomStream;
  }
}

export namespace DDPServer {
  /** How a publication reconciles documents across overlapping subscriptions. */
  interface PublicationStrategy {
    useDummyDocumentView: boolean;
    useCollectionView: boolean;
    doAccountingForCollection: boolean;
  }

  /** The built-in publication strategies, passed to `setPublicationStrategy`. */
  var publicationStrategies: {
    SERVER_MERGE: PublicationStrategy;
    NO_MERGE_NO_HISTORY: PublicationStrategy;
    NO_MERGE: PublicationStrategy;
    NO_MERGE_MULTI: PublicationStrategy;
  };
}
