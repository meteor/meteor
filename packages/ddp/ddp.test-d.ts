import { expectTypeOf } from "expect-type";
import { DDP, DDPServer, DDPCommon } from "./ddp";
import { Meteor } from "meteor/meteor";

// --- DDP ---
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

declare const connection: DDP.DDPStatic;
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

// --- DDPCommon ---
expectTypeOf<DDPCommon.MethodInvocation>().toBeObject();
expectTypeOf<DDPCommon.MethodInvocationOptions>().toBeObject();
expectTypeOf<DDPCommon.Heartbeat>().toBeObject();
expectTypeOf<DDPCommon.HeartbeatOptions>().toBeObject();
expectTypeOf<DDPCommon.RandomStream>().toBeObject();
expectTypeOf(DDPCommon.SUPPORTED_DDP_VERSIONS).toEqualTypeOf<string[]>();
expectTypeOf(DDPCommon.parseDDP).toBeFunction();
expectTypeOf(DDPCommon.stringifyDDP).toBeFunction();
expectTypeOf(DDPCommon.makeRpcSeed).toBeFunction();
declare const invocation: DDPCommon.MethodInvocation;
expectTypeOf(invocation.setUserId("user-id")).toEqualTypeOf<Promise<void>>();

// --- DDPServer ---
expectTypeOf(DDPServer).toBeObject();
expectTypeOf<DDPServer.PublicationStrategy>().toBeObject();
expectTypeOf(DDPServer.publicationStrategies).toBeObject();
