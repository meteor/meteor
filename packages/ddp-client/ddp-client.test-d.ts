import { expectTypeOf } from "expect-type";
import { DDP } from "meteor/ddp-client";
import type { Meteor } from "meteor/meteor";

expectTypeOf(DDP).toBeObject();
expectTypeOf<DDP.DDPStatic>().toBeObject();
expectTypeOf<DDP.DDPStatus>().toBeObject();
expectTypeOf<DDP.Argument>().not.toBeAny();
expectTypeOf<DDP.Result>().not.toBeAny();
expectTypeOf<DDP.SubscriptionCallbacks>().toBeObject();
expectTypeOf<DDP.SubscriptionCallback>().not.toBeAny();
expectTypeOf<DDP.MethodCallback<number>>().toBeFunction();
expectTypeOf<DDP.MethodHandler>().toBeFunction();
expectTypeOf<DDP.Status>().toEqualTypeOf<
  "connected" | "connecting" | "failed" | "waiting" | "offline"
>();
expectTypeOf(DDP.connect).toBeFunction();

const connection = DDP.connect("http://localhost:3000", { retry: false });
const resultCallback = (
  _error: Error | Meteor.Error | undefined,
  _result?: number
) => {};

expectTypeOf(connection.subscribe).toBeCallableWith(
  "items",
  "active",
  10
);
expectTypeOf(connection.subscribe).toBeCallableWith("items", () => {});
expectTypeOf(connection.subscribe).toBeCallableWith("items", {
  onReady() {},
  onStop(_error?: Error) {},
});
expectTypeOf(connection.call<number>).toBeCallableWith("sum", 1, 2);
expectTypeOf(connection.call<number>).toBeCallableWith(
  "sum",
  1,
  2,
  resultCallback
);
expectTypeOf(connection.call<number>("sum", 1, 2)).toEqualTypeOf<
  number | undefined | Promise<number>
>();
expectTypeOf(connection.call<number>(
  "sum",
  1,
  2,
  resultCallback,
)).toBeVoid();
expectTypeOf(connection.callAsync<number>).toBeCallableWith("sum", 1, 2);
expectTypeOf(connection.call).toBeCallableWith(
  "legacy-extension-value",
  new URL("https://meteor.com")
);
expectTypeOf(connection.apply<number>).toBeCallableWith(
  "sum",
  [1, 2] as const,
  { wait: true },
  resultCallback
);
connection.methods({
  findById(id: string) {
    return id;
  },
});
interface NamedConnectionMethods {
  findById(id: string): string;
}
const namedConnectionMethods: NamedConnectionMethods = {
  findById(id) {
    return id;
  },
};
connection.methods(namedConnectionMethods);

expectTypeOf(connection.close()).toBeVoid();
expectTypeOf(connection.callAsync<string>("parse", { fixtureId: "fixture" }))
  .toEqualTypeOf<Promise<string>>();

const reconnectHandle = DDP.onReconnect((reconnected) => {
  expectTypeOf(reconnected).toEqualTypeOf<DDP.DDPStatic>();
});
expectTypeOf(DDP.onReconnect).returns.toEqualTypeOf<{ stop(): void }>();
expectTypeOf(reconnectHandle.stop()).toBeVoid();
expectTypeOf<DDP.DDPStatic["onReconnect"]>()
  .toEqualTypeOf<(() => void | Promise<void>) | null>();
connection.onReconnect = async () => {};
connection.onReconnect();
// @ts-expect-error The per-connection hook is not a registration method.
connection.onReconnect(() => {});
connection.onReconnect = null;
// @ts-expect-error The per-connection hook receives no connection argument.
connection.onReconnect = (_reconnected: DDP.DDPStatic) => {};
