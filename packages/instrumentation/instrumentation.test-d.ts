import { expectTypeOf } from "expect-type";
import { Instrumentation } from "./instrumentation";
import { Instrumentation as ModuleInstrumentation } from "meteor/instrumentation";

// The installed package and the declaration resource expose the same API.
expectTypeOf(ModuleInstrumentation).toEqualTypeOf<typeof Instrumentation>();

expectTypeOf<Instrumentation.EventType>().toEqualTypeOf<
  | "method.start"
  | "method.end"
  | "method.error"
  | "publication.start"
  | "publication.ready"
  | "publication.stop"
  | "publication.error"
  | "ddp.connection.open"
  | "ddp.connection.close"
>();

expectTypeOf<Instrumentation.EventMap>().toEqualTypeOf<{
  "method.start": Instrumentation.MethodStartEvent;
  "method.end": Instrumentation.MethodEndEvent;
  "method.error": Instrumentation.MethodErrorEvent;
  "publication.start": Instrumentation.PublicationStartEvent;
  "publication.ready": Instrumentation.PublicationReadyEvent;
  "publication.stop": Instrumentation.PublicationStopEvent;
  "publication.error": Instrumentation.PublicationErrorEvent;
  "ddp.connection.open": Instrumentation.ConnectionOpenEvent;
  "ddp.connection.close": Instrumentation.ConnectionCloseEvent;
}>();
expectTypeOf(Instrumentation.on).toBeFunction();
expectTypeOf(Instrumentation.on).returns.toEqualTypeOf<Instrumentation.Registration>();

const registration = Instrumentation.on("method.start", (event) => {
  expectTypeOf(event).toEqualTypeOf<Instrumentation.MethodStartEvent>();
  expectTypeOf(event.type).toEqualTypeOf<"method.start">();
  expectTypeOf(event.eventName).toEqualTypeOf<string>();
  expectTypeOf(event.ts).toEqualTypeOf<number>();
  expectTypeOf(event.traceId).toEqualTypeOf<string | null>();
  expectTypeOf(event.spanId).toEqualTypeOf<string | null>();
  expectTypeOf(event.connectionId).toEqualTypeOf<string | null>();
  expectTypeOf(event.userId).toEqualTypeOf<string | null>();
  expectTypeOf(event.name).toEqualTypeOf<string>();
  expectTypeOf(event.argsCount).toEqualTypeOf<number>();
  expectTypeOf(event.args).toBeUnknown();
  // Start events do not have a duration, result, or error.
  // @ts-expect-error only terminal method events carry a duration
  event.durationMs;
  // @ts-expect-error results are only captured on method.end
  event.result;
  // @ts-expect-error errors are only attached to method.error
  event.error;
});
expectTypeOf(registration).toEqualTypeOf<Instrumentation.Registration>();
expectTypeOf(registration.stop()).toBeVoid();

Instrumentation.on("method.end", async (event) => {
  expectTypeOf(event).toEqualTypeOf<Instrumentation.MethodEndEvent>();
  expectTypeOf(event.durationMs).toEqualTypeOf<number>();
  expectTypeOf(event.result).toBeUnknown();
  // A captured preview is not an application's original result type.
  // @ts-expect-error captured values must be narrowed before accessing fields
  event.result.orderId;
  return event.durationMs;
});

Instrumentation.on("method.error", (event) => {
  expectTypeOf(event).toEqualTypeOf<Instrumentation.MethodErrorEvent>();
  expectTypeOf(event.durationMs).toEqualTypeOf<number>();
  expectTypeOf(event.error).toEqualTypeOf<Instrumentation.ErrorPreview>();
  expectTypeOf(event.error.name).toEqualTypeOf<string>();
  expectTypeOf(event.error.message).toEqualTypeOf<string>();
  expectTypeOf(event.error.error).toBeUnknown();
  expectTypeOf(event.error.reason).toBeUnknown();
  // @ts-expect-error error previews deliberately omit the raw stack
  event.error.stack;
  // @ts-expect-error error previews deliberately omit Meteor.Error.details
  event.error.details;
});

Instrumentation.on("publication.start", (event) => {
  expectTypeOf(event).toEqualTypeOf<Instrumentation.PublicationStartEvent>();
  expectTypeOf(event.subscriptionId).toEqualTypeOf<string | null>();
  // Universal publications have no name.
  expectTypeOf(event.name).toEqualTypeOf<string | null>();
  expectTypeOf(event.args).toBeUnknown();
  // @ts-expect-error the publication has only just started
  event.durationMs;
});
Instrumentation.on("publication.ready", (event) => {
  expectTypeOf(event).toEqualTypeOf<Instrumentation.PublicationReadyEvent>();
  // The subscription may have started before instrumentation was listening.
  expectTypeOf(event.durationMs).toEqualTypeOf<number | undefined>();
});
Instrumentation.on("publication.stop", (event) => {
  expectTypeOf(event).toEqualTypeOf<Instrumentation.PublicationStopEvent>();
  expectTypeOf(event.durationMs).toEqualTypeOf<number | undefined>();
});
Instrumentation.on("publication.error", (event) => {
  expectTypeOf(event).toEqualTypeOf<Instrumentation.PublicationErrorEvent>();
  expectTypeOf(event.durationMs).toEqualTypeOf<number | undefined>();
  expectTypeOf(event.error).toEqualTypeOf<Instrumentation.ErrorPreview>();
});

Instrumentation.on("ddp.connection.open", (event) => {
  expectTypeOf(event).toEqualTypeOf<Instrumentation.ConnectionOpenEvent>();
  expectTypeOf(event.connectionId).toEqualTypeOf<string>();
  // Client IP capture is opt-in, not guaranteed for every transport.
  expectTypeOf(event.clientAddress).toEqualTypeOf<string | undefined>();
  // @ts-expect-error connection events have no invocation trace
  event.traceId;
  // @ts-expect-error the connection has only just opened
  event.durationMs;
});
Instrumentation.on("ddp.connection.close", (event) => {
  expectTypeOf(event).toEqualTypeOf<Instrumentation.ConnectionCloseEvent>();
  expectTypeOf(event.durationMs).toEqualTypeOf<number>();
  // @ts-expect-error client IP is only supplied on connection.open
  event.clientAddress;
});

// Canonical event types narrow payloads even when eventName is prefixed.
declare const event: Instrumentation.Event;
if (event.type === "method.end") {
  expectTypeOf(event).toEqualTypeOf<Instrumentation.MethodEndEvent>();
  expectTypeOf(event.result).toBeUnknown();
} else if (event.type === "publication.error") {
  expectTypeOf(event).toEqualTypeOf<Instrumentation.PublicationErrorEvent>();
} else if (event.type === "ddp.connection.close") {
  expectTypeOf(event).toEqualTypeOf<Instrumentation.ConnectionCloseEvent>();
}
declare const selectedType: "method.end" | "method.error";
Instrumentation.on(selectedType, (payload) => {
  expectTypeOf(payload).toEqualTypeOf<
    Instrumentation.MethodEndEvent | Instrumentation.MethodErrorEvent
  >();
});
expectTypeOf<Instrumentation.EventMap["method.start"]>().toEqualTypeOf<Instrumentation.MethodStartEvent>();
expectTypeOf<Instrumentation.EventEnvelope<"method.start">>().toEqualTypeOf<{
  type: "method.start";
  eventName: string;
  ts: number;
}>();
expectTypeOf<Instrumentation.InvocationEvent<"method.start">>().toMatchTypeOf<{
  traceId: string | null;
  spanId: string | null;
  connectionId: string | null;
  userId: string | null;
  argsCount: number;
  args?: unknown;
}>();
expectTypeOf<Instrumentation.PublicationEvent<"publication.start">>().toMatchTypeOf<{
  subscriptionId: string | null;
  name: string | null;
}>();

const context = Instrumentation.currentContext();
expectTypeOf(Instrumentation.currentContext).returns.toEqualTypeOf<Instrumentation.Context>();
expectTypeOf(context).toEqualTypeOf<Instrumentation.Context>();
expectTypeOf(context.traceId).toEqualTypeOf<string | null>();
expectTypeOf(context.spanId).toEqualTypeOf<string | null>();
expectTypeOf(context.userId).toEqualTypeOf<string | null>();
expectTypeOf(context.connectionId).toEqualTypeOf<string | null>();
expectTypeOf(context.name).toEqualTypeOf<string | null>();
expectTypeOf(context.kind).toEqualTypeOf<"method" | "publication" | null>();
const emptyContext: Instrumentation.Context = {
  traceId: null,
  spanId: null,
  userId: null,
  connectionId: null,
  kind: null,
  name: null,
};
expectTypeOf(emptyContext).toEqualTypeOf<Instrumentation.Context>();

expectTypeOf<Instrumentation.CaptureMode>().toEqualTypeOf<boolean | "preview">();
expectTypeOf<Instrumentation.ConfigureOptions>().toEqualTypeOf<{
  enabled?: boolean;
  captureMethodArgs?: boolean | "preview";
  captureMethodResult?: boolean | "preview";
  captureClientAddress?: boolean;
  eventPrefix?: string;
  onListenerError?: ((error: unknown, event: Instrumentation.ListenerErrorEvent) => void) | null;
}>();
expectTypeOf(Instrumentation.configure).parameters.toEqualTypeOf<[
  options?: Instrumentation.ConfigureOptions | null,
]>();
expectTypeOf(Instrumentation.configure).returns.toBeVoid();
const options: Instrumentation.ConfigureOptions = {
  enabled: true,
  captureMethodArgs: "preview",
  captureMethodResult: true, // supported alias for bounded preview capture
  captureClientAddress: false,
  eventPrefix: "orders-svc",
  onListenerError(error, failedEvent) {
    // Listeners may throw non-Error values.
    expectTypeOf(error).toBeUnknown();
    expectTypeOf(failedEvent).toEqualTypeOf<Instrumentation.ListenerErrorEvent>();
    expectTypeOf(failedEvent.type).toEqualTypeOf<Instrumentation.EventType>();
    if ("eventName" in failedEvent) {
      expectTypeOf(failedEvent).toEqualTypeOf<Instrumentation.Event>();
    } else {
      expectTypeOf(failedEvent).toEqualTypeOf<Instrumentation.PayloadBuildFailure>();
    }
    // @ts-expect-error payload-build failures only carry the event type
    failedEvent.eventName;
  },
};
expectTypeOf(Instrumentation.configure(options)).toBeVoid();
Instrumentation.configure({});
Instrumentation.configure();
Instrumentation.configure(null);
Instrumentation.configure({ onListenerError: null });
expectTypeOf<Instrumentation.PayloadBuildFailure>().toEqualTypeOf<{
  type: Instrumentation.EventType;
}>();

expectTypeOf<Instrumentation.MethodOptions<
  [order: { _id: string }],
  { insertedId: string }
>>().toEqualTypeOf<{
  captureArgs?: (args: [order: { _id: string }]) => unknown;
  captureResult?: (result: { insertedId: string }) => unknown;
}>();
expectTypeOf(Instrumentation.configureMethod).parameters.toEqualTypeOf<[
  name: string,
  options?: Instrumentation.MethodOptions | null,
]>();
expectTypeOf(Instrumentation.configureMethod).returns.toBeVoid();
const methodOptions: Instrumentation.MethodOptions = {
  captureArgs(args) {
    expectTypeOf(args).toEqualTypeOf<unknown[]>();
    return { first: args[0] };
  },
  captureResult(result) {
    expectTypeOf(result).toBeUnknown();
    return result;
  },
};
expectTypeOf(Instrumentation.configureMethod("orders.create", methodOptions)).toBeVoid();
// Explicit method signatures give defensive-copy projectors typed inputs.
Instrumentation.configureMethod<[order: { _id: string }], { insertedId: string }>(
  "orders.create",
  {
    captureArgs: (args) => ({ orderId: args[0]._id }),
    captureResult: (result) => result.insertedId,
  }
);
Instrumentation.configureMethod("orders.create", {});
Instrumentation.configureMethod("orders.create");
Instrumentation.configureMethod("orders.create", null);

// The private seam is callable by core with raw material, never by event listeners.
expectTypeOf(Instrumentation._emit("method.start", {
  invocation: { userId: null, connection: null },
  name: "orders.create",
  args: [{ _id: "order-1" }],
})).toBeVoid();

// @ts-expect-error there is no wildcard listener API
Instrumentation.on("*", () => {});
// @ts-expect-error eventPrefix changes eventName, not the listener's type
Instrumentation.on("orders-svc.method.start", () => {});
// @ts-expect-error terminal-error listeners cannot be attached to success events
Instrumentation.on("method.end", (payload: Instrumentation.MethodErrorEvent) => {});
// @ts-expect-error raw capture is never supported
Instrumentation.configure({ captureMethodArgs: "raw" });
// @ts-expect-error captureResult is a projector, not a capture-mode flag
Instrumentation.configureMethod("orders.create", { captureResult: true });
