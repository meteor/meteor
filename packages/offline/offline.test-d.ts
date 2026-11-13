import { expectTypeOf } from "expect-type";
import { Offline } from "./offline";
import { Offline as ModuleOffline } from "meteor/offline";
import type { Mongo } from "meteor/mongo";

// The installed package and the declaration resource expose the same API.
expectTypeOf(ModuleOffline).toEqualTypeOf<typeof Offline>();

expectTypeOf<Offline.StartOptions>().toEqualTypeOf<{
  collections?: Mongo.Collection<any>[];
  methods?: string[];
}>();
expectTypeOf(Offline.start).parameters.toEqualTypeOf<[options?: Offline.StartOptions]>();
expectTypeOf(Offline.start).returns.toEqualTypeOf<Promise<void>>();

expectTypeOf<Offline.EventType>().toEqualTypeOf<
  "method.queued" | "method.done" | "method.failed" | "method.dropped" | "ready"
>();
expectTypeOf<Offline.EventMap>().toEqualTypeOf<{
  "method.queued": Offline.CallEvent;
  "method.done": Offline.CallEvent;
  "method.failed": Offline.CallEvent & { error: Offline.CallError };
  "method.dropped": { id: string };
  ready: { userId: string | null; calls: number; documents: number };
}>();
expectTypeOf<Offline.CallEvent>().toEqualTypeOf<{ id: string; name: string }>();
expectTypeOf<Offline.Event<"ready">>().toEqualTypeOf<{
  userId: string | null;
  calls: number;
  documents: number;
} & { type: "ready" }>();

expectTypeOf(Offline.on).toBeFunction();
expectTypeOf(Offline.on).returns.toEqualTypeOf<Offline.Registration>();
const registration = Offline.on("method.failed", (event) => {
  expectTypeOf(event.type).toEqualTypeOf<"method.failed">();
  expectTypeOf(event.id).toEqualTypeOf<string>();
  expectTypeOf(event.name).toEqualTypeOf<string>();
  expectTypeOf(event.error).toEqualTypeOf<Offline.CallError>();
  expectTypeOf(event.error.reason).toEqualTypeOf<string | undefined>();
});
expectTypeOf(registration).toEqualTypeOf<Offline.Registration>();
expectTypeOf(registration.stop()).toBeVoid();
Offline.on("method.dropped", (event) => {
  expectTypeOf(event.id).toEqualTypeOf<string>();
  // A dropped call is only identified by its id.
  expectTypeOf(event).not.toHaveProperty("name");
});
Offline.on("ready", (event) => {
  expectTypeOf(event.userId).toEqualTypeOf<string | null>();
  expectTypeOf(event.calls).toEqualTypeOf<number>();
  expectTypeOf(event.documents).toEqualTypeOf<number>();
});

expectTypeOf(Offline.pending).returns.toEqualTypeOf<Promise<Offline.Call[]>>();
expectTypeOf(Offline.failed).returns.toEqualTypeOf<Promise<Offline.Call[]>>();
expectTypeOf<Offline.Call>().toEqualTypeOf<{
  id: string;
  name: string;
  args: unknown[];
  queuedAt: number;
  status: "pending" | "failed";
  error?: Offline.CallError;
}>();
expectTypeOf<Offline.CallError>().toEqualTypeOf<{
  error?: unknown;
  reason?: string;
  message?: string;
  details?: unknown;
}>();
expectTypeOf(Offline.drop).parameters.toEqualTypeOf<[id: string]>();
expectTypeOf(Offline.drop).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(Offline.clear).returns.toEqualTypeOf<Promise<void>>();
