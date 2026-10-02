/** Server-only, read-only lifecycle instrumentation for methods, publications and DDP connections. */
export namespace Instrumentation {
  /** Canonical listener types; configuring a prefix only changes `eventName`. */
  type EventType = keyof EventMap;

  interface EventEnvelope<T extends EventType = EventType> {
    type: T;
    eventName: string;
    /** Milliseconds since the Unix epoch. */
    ts: number;
  }

  interface InvocationEvent<T extends EventType = EventType> extends EventEnvelope<T> {
    traceId: string | null;
    spanId: string | null;
    connectionId: string | null;
    userId: string | null;
    argsCount: number;
    /** Optional bounded preview, not the raw argument array. */
    args?: unknown;
  }

  /** Safe error summary, never the original Error or its stack/details. */
  interface ErrorPreview {
    name: string;
    message: string;
    /** Optional application error code; non-string codes are preserved. */
    error?: unknown;
    reason?: unknown;
  }

  interface MethodStartEvent extends InvocationEvent<"method.start"> {
    name: string;
  }

  interface MethodEndEvent extends InvocationEvent<"method.end"> {
    name: string;
    durationMs: number;
    /** Optional bounded preview, including results from custom projectors. */
    result?: unknown;
  }

  interface MethodErrorEvent extends InvocationEvent<"method.error"> {
    name: string;
    durationMs: number;
    error: ErrorPreview;
  }

  interface PublicationEvent<T extends EventType = EventType> extends InvocationEvent<T> {
    /** Universal publications have a null name. */
    name: string | null;
    subscriptionId: string | null;
  }

  interface PublicationStartEvent extends PublicationEvent<"publication.start"> {}

  interface PublicationReadyEvent extends PublicationEvent<"publication.ready"> {
    /** Omitted if instrumentation did not record the subscription start. */
    durationMs?: number;
  }

  interface PublicationStopEvent extends PublicationEvent<"publication.stop"> {
    durationMs?: number;
  }

  interface PublicationErrorEvent extends PublicationEvent<"publication.error"> {
    durationMs?: number;
    error: ErrorPreview;
  }

  interface ConnectionOpenEvent extends EventEnvelope<"ddp.connection.open"> {
    connectionId: string;
    /** Only present when opted in and supplied by the transport. */
    clientAddress?: string;
  }

  interface ConnectionCloseEvent extends EventEnvelope<"ddp.connection.close"> {
    connectionId: string;
    durationMs: number;
  }

  interface EventMap {
    "method.start": MethodStartEvent;
    "method.end": MethodEndEvent;
    "method.error": MethodErrorEvent;
    "publication.start": PublicationStartEvent;
    "publication.ready": PublicationReadyEvent;
    "publication.stop": PublicationStopEvent;
    "publication.error": PublicationErrorEvent;
    "ddp.connection.open": ConnectionOpenEvent;
    "ddp.connection.close": ConnectionCloseEvent;
  }

  /** Discriminated by the canonical `type`, independently of `eventName`. */
  type Event = EventMap[EventType];

  interface Registration {
    /** Remove this listener. Calling stop repeatedly is safe. */
    stop(): void;
  }

  /** Registers one canonical event type. Listeners are never awaited. */
  function on<T extends EventType>(type: T, listener: (event: EventMap[T]) => unknown): Registration;

  /** All fields are null outside a method/publication invocation. */
  interface Context {
    traceId: string | null;
    spanId: string | null;
    userId: string | null;
    connectionId: string | null;
    kind: "method" | "publication" | null;
    /** Server-initiated calls may have no invocation name. */
    name: string | null;
  }

  function currentContext(): Context;

  /** `true` is an alias for bounded preview capture; raw capture is unsupported. */
  type CaptureMode = boolean | "preview";

  /** When building a payload fails, the reporter receives only its type. */
  interface PayloadBuildFailure {
    type: EventType;
  }

  type ListenerErrorEvent = Event | PayloadBuildFailure;

  interface ConfigureOptions {
    enabled?: boolean;
    /** Includes method and publication arguments. Off by default. */
    captureMethodArgs?: CaptureMode;
    captureMethodResult?: CaptureMode;
    captureClientAddress?: boolean;
    eventPrefix?: string;
    onListenerError?: ((error: unknown, event: ListenerErrorEvent) => void) | null;
  }

  /** Updates only supplied options. A null error handler restores silent reporting. */
  function configure(options?: ConfigureOptions | null): void;

  interface MethodOptions<TArgs extends unknown[] = unknown[], TResult = unknown> {
    /** Receives an EJSON defensive copy; its return value is bounded again. */
    captureArgs?: (args: TArgs) => unknown;
    captureResult?: (result: TResult) => unknown;
  }

  /** Method-scoped projectors; Accounts secrets stay redacted regardless of options. */
  function configureMethod<TArgs extends unknown[] = unknown[], TResult = unknown>(
    name: string,
    options?: MethodOptions<TArgs, TResult> | null
  ): void;

  /** @internal Raw emission entry point used by the core DDP seam. */
  function _emit(type: EventType, raw: Record<string, unknown>): void;
}
