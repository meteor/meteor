import { Meteor } from "meteor/meteor";
import { EJSONable, EJSONableProperty } from "meteor/ejson";

export namespace DDP {
  type Argument = EJSONable | EJSONableProperty;
  type Result = EJSONable | EJSONable[] | EJSONableProperty | EJSONableProperty[];

  interface SubscriptionCallbacks {
    onReady?: (() => void) | undefined;
    onStop?: ((error?: Error | Meteor.Error) => void) | undefined;
  }

  type SubscriptionCallback = (() => void) | SubscriptionCallbacks;
  type MethodCallback<Result> = (error: Error | Meteor.Error | undefined, result?: Result) => void;

  type MethodHandler = {
    bivarianceHack(this: DDPCommon.MethodInvocation, ...args: unknown[]): unknown;
  }["bivarianceHack"];

  interface DDPStatic {
    subscribe(name: string, ...args: Argument[]): Meteor.SubscriptionHandle;
    subscribe(
      name: string,
      ...args: [...Argument[], SubscriptionCallback]
    ): Meteor.SubscriptionHandle;
    call<Result extends DDP.Result = DDP.Result>(method: string, ...parameters: Argument[]): Result;
    call<Result extends DDP.Result = DDP.Result>(
      method: string,
      ...parameters: [...Argument[], MethodCallback<Result>]
    ): Result;
    callAsync<Result extends DDP.Result = DDP.Result>(
      method: string,
      ...parameters: Argument[]
    ): Promise<Result>;
    apply<Result extends DDP.Result = DDP.Result>(
      method: string,
      args: ReadonlyArray<Argument>,
      options?: Meteor.MethodApplyOptions<Result>,
      callback?: MethodCallback<Result>,
    ): Result;
    methods<T extends { [K in keyof T]: MethodHandler }>(methods: T): void;
    subscribe(name: string, ...rest: unknown[]): Meteor.SubscriptionHandle;
    call<Result = unknown>(method: string, ...parameters: unknown[]): Result;
    callAsync<Result = unknown>(method: string, ...parameters: unknown[]): Promise<Result>;
    apply<Result = unknown>(method: string, ...parameters: unknown[]): Result;
    status(): DDPStatus;
    reconnect(): void;
    disconnect(): void;
    onReconnect(callback: (connection: DDPStatic) => void | Promise<void>): {
      stop(): void;
    };
  }

  function _allSubscriptionsReady(): boolean;

  type Status = "connected" | "connecting" | "failed" | "waiting" | "offline";

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

// DDPServer is owned by the ddp-server package; re-export it by name so
// `import { DDPServer } from "meteor/ddp"` keeps working (export * does not
// cross zodern:types export= wrappers, a named re-export does).
import { DDPServer } from "meteor/ddp-server";
export { DDPServer };
