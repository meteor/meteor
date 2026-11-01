import type { Mongo } from "meteor/mongo";

/** Client-only: keeps published documents and queued Method calls on the device across reloads and offline periods. */
export namespace Offline {
  interface StartOptions {
    /** Collections whose Minimongo contents are copied to the device and loaded back on the next start. */
    collections?: Mongo.Collection<any>[];
    /** Names of the Methods whose calls are recorded until the server answers. They must be idempotent. */
    methods?: string[];
  }

  /** Safe summary of the server's error, as stored on the device. */
  interface CallError {
    error?: unknown;
    reason?: string;
    message?: string;
  }

  interface Call {
    id: string;
    name: string;
    /** Parsed back from the EJSON copy. */
    args: unknown[];
    /** Milliseconds since the Unix epoch. */
    queuedAt: number;
    status: "pending" | "failed";
    /** Only on failed calls. */
    error?: CallError;
  }

  interface CallEvent {
    id: string;
    name: string;
  }

  interface EventMap {
    /** A call to an allowed Method has been recorded. */
    "method.queued": CallEvent;
    /** The server answered without error; the record is gone. */
    "method.done": CallEvent;
    /** The server rejected the call; the record is kept with its error. */
    "method.failed": CallEvent & { error: unknown };
    /** The app dropped a recorded call. */
    "method.dropped": { id: string };
    /** The copy is loaded and the recorded calls are queued, on start and on user change. */
    ready: { userId: string | null; calls: number; documents: number };
  }

  type EventType = keyof EventMap;

  type Event<T extends EventType = EventType> = EventMap[T] & { type: T };

  interface Registration {
    stop(): void;
  }

  /** Call once at client startup, before subscribing. Resolves once the copy is in Minimongo. */
  function start(options?: StartOptions): Promise<void>;

  function on<T extends EventType>(type: T, listener: (event: Event<T>) => void): Registration;

  /** Recorded calls the server has not answered yet, oldest first. */
  function pending(): Promise<Call[]>;

  /** Recorded calls the server rejected, oldest first. */
  function failed(): Promise<Call[]>;

  /** Forgets a recorded call. A call still in flight is not cancelled, only not replayed after a reload. */
  function drop(id: string): Promise<void>;

  /** Empties the current user's copy: documents and recorded calls. */
  function clear(): Promise<void>;
}
