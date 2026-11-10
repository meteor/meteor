import { expectTypeOf } from "expect-type";
import type { MessagePort } from "worker_threads";
import {
  BridgeError,
  BridgeTimeoutError,
  BridgeSerializationError,
  BridgeContextError,
  MeteorError,
  serializeError,
  deserializeError,
  createThreadContext,
  BridgeHost,
  BridgeClient,
  CollectionHandler,
  MethodHandler,
  createCollectionProxy,
  createMethodProxy,
  createConnectionProxy,
  createBridgeInvocation,
  hydrateContext,
  getActiveBridgeCount,
  destroyAllBridges,
  installShutdownHandlers,
  resetSettingsSnapshot,
} from "./thread-context";

// --- Error classes ---
expectTypeOf(new BridgeError("x")).toExtend<Error>();
expectTypeOf(new BridgeError("x").name).toBeString();
expectTypeOf(new BridgeTimeoutError("x")).toExtend<BridgeError>();
expectTypeOf(new BridgeSerializationError("x")).toExtend<BridgeError>();
expectTypeOf(new BridgeContextError("x")).toExtend<BridgeError>();

const meteorError = new MeteorError(404, "Not found", "details");
expectTypeOf(meteorError).toExtend<Error>();
expectTypeOf(meteorError.isClientSafe).toBeBoolean();
expectTypeOf(meteorError.error).toEqualTypeOf<string | number>();
expectTypeOf(meteorError.reason).toEqualTypeOf<string | undefined>();
expectTypeOf(meteorError.details).toEqualTypeOf<string | undefined>();

// --- Error serialization ---
expectTypeOf(serializeError).parameters.toEqualTypeOf<[Error]>();
expectTypeOf(deserializeError).returns.toEqualTypeOf<Error>();
const serialized = serializeError(new Error("boom"));
expectTypeOf(serialized.type).toBeString();
expectTypeOf(serialized.message).toBeString();
expectTypeOf(serialized.stack).toEqualTypeOf<string | undefined>();
expectTypeOf(serialized.meteorError).toEqualTypeOf<string | number | undefined>();
expectTypeOf(serialized.reason).toEqualTypeOf<string | undefined>();
expectTypeOf(serialized.details).toEqualTypeOf<string | undefined>();
expectTypeOf(deserializeError(serialized)).toEqualTypeOf<Error>();

// --- Bridge context (main thread) ---
const ctx = createThreadContext({
  userId: "u1",
  connectionId: null,
  callTimeout: 1000,
  onMessage(msg) {
    expectTypeOf(msg.v).toEqualTypeOf<1>();
    expectTypeOf(msg.id).toBeString();
    expectTypeOf(msg.type).toBeString();
    expectTypeOf(msg.collectionName).toEqualTypeOf<string | undefined>();
    expectTypeOf(msg.op).toEqualTypeOf<string | undefined>();
    expectTypeOf(msg.args).toEqualTypeOf<any[] | undefined>();
    expectTypeOf(msg.methodName).toEqualTypeOf<string | undefined>();
    expectTypeOf(msg.methodArgs).toEqualTypeOf<any[] | undefined>();
    return undefined;
  },
  onResult: (_msg, result) => result,
});
expectTypeOf(createThreadContext).returns.toEqualTypeOf(ctx);
expectTypeOf(createThreadContext()).toEqualTypeOf(ctx);
expectTypeOf(ctx.port).toEqualTypeOf<MessagePort>();
expectTypeOf(ctx.settings).toEqualTypeOf<Readonly<Record<string, any>>>();
expectTypeOf(ctx.userId).toEqualTypeOf<string | null>();
expectTypeOf(ctx.connectionId).toEqualTypeOf<string | null>();
expectTypeOf(ctx.callTimeout).toBeNumber();
expectTypeOf(ctx.bridgeModuleUrl).toBeString();
expectTypeOf(ctx.destroy).returns.toBeVoid();

// workerData is the clone-safe subset: everything but destroy.
expectTypeOf<keyof typeof ctx.workerData>().toEqualTypeOf<
  "port" | "settings" | "userId" | "connectionId" | "callTimeout" | "bridgeModuleUrl"
>();
expectTypeOf(ctx.workerData.port).toEqualTypeOf<MessagePort>();
expectTypeOf(ctx.workerData.bridgeModuleUrl).toBeString();

// --- Bridge infrastructure ---
const host = new BridgeHost({ userId: null });
expectTypeOf(new BridgeHost()).toEqualTypeOf(host);
expectTypeOf(host.port).toEqualTypeOf<MessagePort>();
expectTypeOf(host.transferPort).toEqualTypeOf<MessagePort>();
expectTypeOf(host.context).toEqualTypeOf<{ userId: string | null; connectionId: string | null }>();
expectTypeOf(host.callTimeout).toBeNumber();
expectTypeOf(host.destroyed).toBeBoolean();
expectTypeOf(host.registerHandler).returns.toBeVoid();
expectTypeOf(host.destroy).returns.toBeVoid();

const client = new BridgeClient(host.transferPort, { callTimeout: 500 });
expectTypeOf(new BridgeClient(host.transferPort)).toEqualTypeOf(client);
expectTypeOf(client.port).toEqualTypeOf<MessagePort>();
expectTypeOf(client.call({ type: "method", methodName: "x" })).toEqualTypeOf<Promise<any>>();

// --- Handlers ---
const collectionHandler = new CollectionHandler({ userId: "u1", connectionId: null });
expectTypeOf(CollectionHandler).instance.toEqualTypeOf(collectionHandler);
expectTypeOf(collectionHandler.handle).returns.toEqualTypeOf<Promise<any>>();
const methodHandler = new MethodHandler({ userId: null, connectionId: "c1" });
expectTypeOf(MethodHandler).instance.toEqualTypeOf(methodHandler);
expectTypeOf(methodHandler.handle).returns.toEqualTypeOf<Promise<any>>();
host.registerHandler("collection", collectionHandler);
host.registerHandler("method", methodHandler);

// --- Proxy factories ---
const Collections = createCollectionProxy(client);
expectTypeOf(createCollectionProxy).returns.toEqualTypeOf(Collections);
expectTypeOf(Collections.Reports.findOneAsync({ _id: "x" })).toEqualTypeOf<Promise<any>>();
expectTypeOf(Collections.Reports.insertAsync({ a: 1 })).toEqualTypeOf<Promise<string>>();
expectTypeOf(Collections.Reports.updateAsync({}, { $set: { a: 2 } })).toEqualTypeOf<Promise<number>>();
expectTypeOf(Collections.Reports.removeAsync({})).toEqualTypeOf<Promise<number>>();
expectTypeOf(Collections.Reports.upsertAsync({}, { $set: { a: 2 } })).toEqualTypeOf<
  Promise<{ numberAffected: number; insertedId?: string }>
>();
expectTypeOf(Collections.Reports.aggregate([])).toEqualTypeOf<Promise<any[]>>();

const cursor = Collections.Reports.find({}, { sort: { a: 1 } });
expectTypeOf(Collections.Reports.find()).toEqualTypeOf(cursor);
expectTypeOf(cursor.fetchAsync()).toEqualTypeOf<Promise<any[]>>();
expectTypeOf(cursor.countAsync()).toEqualTypeOf<Promise<number>>();
expectTypeOf(cursor.forEachAsync).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(cursor.mapAsync((doc) => String(doc))).toEqualTypeOf<Promise<string[]>>();
expectTypeOf(cursor.observe).returns.toBeNever();
expectTypeOf(cursor.observeChanges).returns.toBeNever();

const methods = createMethodProxy(client);
expectTypeOf(createMethodProxy).returns.toEqualTypeOf(methods);
expectTypeOf(methods.callAsync("name", 1, "two")).toEqualTypeOf<Promise<any>>();

const connection = createConnectionProxy("conn-1");
expectTypeOf(createConnectionProxy).parameters.toEqualTypeOf<[string | null]>();
expectTypeOf(connection.id).toEqualTypeOf<string | null>();
expectTypeOf(createConnectionProxy(null).id).toEqualTypeOf<string | null>();

expectTypeOf(createBridgeInvocation).returns.toBeAny();
expectTypeOf(createBridgeInvocation({ userId: null, connectionId: null }, "name")).toBeAny();

// --- Worker side ---
const hydratedFromPort = hydrateContext(ctx.port, { userId: "u1", callTimeout: 100, settings: {} });
const hydratedFromData = hydrateContext(ctx.workerData);
expectTypeOf(hydrateContext).returns.toEqualTypeOf(hydratedFromData);
expectTypeOf(hydratedFromData).toEqualTypeOf(hydratedFromPort);
expectTypeOf(hydrateContext(ctx.port)).toEqualTypeOf(hydratedFromPort);
expectTypeOf(hydratedFromData.Collections).toEqualTypeOf(Collections);

const { Meteor: workerMeteor } = hydratedFromData;
expectTypeOf(workerMeteor.callAsync("name", 1)).toEqualTypeOf<Promise<any>>();
expectTypeOf(workerMeteor.settings).toEqualTypeOf<Readonly<Record<string, any>>>();
expectTypeOf(workerMeteor.userId()).toEqualTypeOf<string | null>();
expectTypeOf(workerMeteor.isServer).toEqualTypeOf<true>();
expectTypeOf(workerMeteor.isSimulation).toEqualTypeOf<false>();
expectTypeOf(workerMeteor.isClient).toEqualTypeOf<false>();
expectTypeOf(workerMeteor.Error).toEqualTypeOf<typeof MeteorError>();
expectTypeOf(new workerMeteor.Error("code")).toEqualTypeOf<MeteorError>();

// --- Shutdown ---
expectTypeOf(getActiveBridgeCount).returns.toBeNumber();
expectTypeOf(destroyAllBridges).returns.toBeVoid();
expectTypeOf(installShutdownHandlers).returns.toBeVoid();
expectTypeOf(installShutdownHandlers()).toBeVoid();
expectTypeOf(installShutdownHandlers({ exit: true })).toBeVoid();
expectTypeOf(resetSettingsSnapshot).returns.toBeVoid();
