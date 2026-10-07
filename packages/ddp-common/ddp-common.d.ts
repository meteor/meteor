import type { Meteor } from 'meteor/meteor';
import type { Random } from 'meteor/random';

export namespace DDPCommon {
  interface MethodInvocationOptions {
    name?: string;
    userId: string | null;
    setUserId?: ((newUserId: string | null) => void | Promise<void>) | undefined;
    isSimulation: boolean;
    isFromCallAsync?: boolean;
    connection?: Meteor.Connection | null;
    randomSeed: string | null | (() => string);
    unblock?: (() => void) | null;
    /** Opaque server write-fence state, stored unchanged by the invocation. */
    fence?: unknown;
  }

  /** The state for a single invocation of a method, referenced by this inside a method definition. */
  class MethodInvocation {
    constructor(options: MethodInvocationOptions);
    name: string | undefined;
    /**
     * Call inside a method invocation. Allow subsequent methods from this client to begin running.
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
     * Access inside a method invocation. Boolean value, true if this invocation is a stub.
     */
    isSimulation: boolean;
    /**
     * The connection that received this method, `null` for a server-initiated call,
     * or `undefined` for a client stub.
     */
    connection: Meteor.Connection | null | undefined;
    randomSeed: MethodInvocationOptions['randomSeed'];
    randomStream: RandomStream | null;
  }

  /** Supported DDP protocol versions, newest first. */
  const SUPPORTED_DDP_VERSIONS: string[];

  /** Parse a raw DDP wire string into a message object, or `null` if invalid. */
  function parseDDP(stringMessage: string): Record<string, unknown> | null;

  /** Serialize a DDP message object to its wire string. */
  function stringifyDDP(msg: Record<string, unknown>): string;

  /**
   * Converts DDP messages to and from the transport payload. The serializer is
   * process-wide: the server and every client connecting to it must install the
   * same one before any connection is opened.
   */
  interface Serializer {
    /** Identifier, `'ejson'` for the default serializer. */
    name: string;
    /** Frame type the transport must use. Only `'text'` is accepted for now. */
    wireFormat: 'text';
    /** Encode a DDP message for the wire. Must not mutate its input. */
    serialize(msg: Record<string, unknown>): string;
    /** Decode a wire payload into a DDP message. Throws on invalid input. */
    deserialize(raw: string): Record<string, unknown>;
  }

  /** Install the process-wide DDP serializer. Throws when `serialize`, `deserialize` or `wireFormat` is invalid. */
  function setSerializer(serializer: Serializer): void;

  /** The active DDP serializer. */
  function getSerializer(): Serializer;

  /** Create the default EJSON serializer, which produces Meteor's historical DDP wire format. */
  function createEJSONSerializer(): Serializer;

  /** Move cleared fields (`undefined` values in `fields`) into a wire-level `cleared` array. Returns the input itself when nothing is cleared. */
  function toWireMessage(msg: Record<string, unknown>): Record<string, unknown>;

  /** Restore the `cleared` entries of a wire message as `undefined` values in `fields`, in place. */
  function fromWireMessage(msg: Record<string, unknown>): Record<string, unknown>;

  /** Derive the deterministic random seed used by a method stub. */
  function makeRpcSeed(enclosing: MethodInvocation | null | undefined, methodName: string): string;

  /** Options for constructing a `Heartbeat`. */
  interface HeartbeatOptions {
    heartbeatInterval: number;
    heartbeatTimeout: number;
    onTimeout: () => void;
    sendPing: () => void;
  }

  /** Client/server heartbeat used to detect dropped DDP connections. */
  class Heartbeat {
    constructor(options: HeartbeatOptions);
    /** Begin sending pings and watching for timeouts. */
    start(): void;
    /** Stop all heartbeat timers. */
    stop(): void;
    /** Reset the timeout timer after any message is received. */
    messageReceived(): void;
  }

  type RandomStreamSeed = string | number | (() => string | number);

  interface RandomStreamScope {
    randomSeed?: RandomStreamSeed | readonly RandomStreamSeed[] | null;
    randomStream?: RandomStream | null;
  }

  /** A deterministic, seeded source of `Random` generators. */
  class RandomStream {
    constructor(options: { seed?: RandomStreamSeed | readonly RandomStreamSeed[] | null });
    /** Internal lookup used by `get` to create or reuse a named sequence. */
    _sequence(name: string): Random.RandomGenerator;
    /** Use a named sequence for the scope, or `Random.insecure` without a scope. */
    static get(scope: RandomStreamScope | null | undefined, name?: string): Random.RandomGenerator;
  }
}
