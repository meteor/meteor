import { expectTypeOf } from "expect-type";
import { onPageLoad } from "./server-render";
import type {
  Content,
  ClientSink,
  CategorizedRequest,
  ServerSink,
  Sink,
  Callback,
} from "./server-render";

expectTypeOf<Content>().not.toBeNever();
expectTypeOf<ClientSink>().toBeObject();
expectTypeOf<CategorizedRequest>().toBeObject();
expectTypeOf<ServerSink>().toBeObject();
expectTypeOf<Sink>().not.toBeNever();
expectTypeOf<Callback>().toBeFunction();
expectTypeOf<Callback<string>>().toBeFunction();
expectTypeOf(onPageLoad).toBeFunction();

expectTypeOf<Callback>().returns.toBeAny();
expectTypeOf<Callback<string>>().returns.toEqualTypeOf<Promise<string> | string>();
expectTypeOf<Callback>().parameter(0).toEqualTypeOf<Sink>();

onPageLoad((sink) => {
  expectTypeOf(sink).toEqualTypeOf<Sink>();
});
onPageLoad(async (sink) => {
  expectTypeOf(sink).toEqualTypeOf<Sink>();
});
onPageLoad(async (sink) => {
  expectTypeOf(sink).toEqualTypeOf<Sink>();
  return "value";
});
onPageLoad((sink) => {
  expectTypeOf(sink).toEqualTypeOf<Sink>();
  return 42;
});

// onPageLoad carries static members (remove / clear / chain)
expectTypeOf(onPageLoad.remove).toBeFunction();
expectTypeOf(onPageLoad.clear).returns.toBeVoid();
expectTypeOf(onPageLoad.chain).returns.toEqualTypeOf<Promise<void>>();
