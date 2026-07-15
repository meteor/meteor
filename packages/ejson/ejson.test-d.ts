import { expectTypeOf } from "expect-type";
import type { EJSON, EJSONable, EJSONableCustomType, EJSONableProperty, JSONable } from "./ejson";
import { EJSON as EJSONNs } from "./ejson";

expectTypeOf<EJSONable>()
  .toHaveProperty("x" as string)
  .toEqualTypeOf<EJSONableProperty>();
expectTypeOf<EJSONableProperty>().toEqualTypeOf<EJSONableProperty>();
expectTypeOf<EJSON>().toExtend<EJSONable>();
expectTypeOf<JSONable>().toHaveProperty("x" as string);

expectTypeOf<EJSONableCustomType>().toHaveProperty("toJSONValue");
expectTypeOf<EJSONableCustomType["toJSONValue"]>().returns.toEqualTypeOf<JSONable>();
expectTypeOf<EJSONableCustomType["typeName"]>().returns.toBeString();

expectTypeOf(EJSONNs.addType).parameters.toEqualTypeOf<
  [string, (val: JSONable) => EJSONableCustomType]
>();
expectTypeOf(EJSONNs.addType).returns.toBeVoid();

expectTypeOf(EJSONNs.clone<number>(1)).toBeNumber();
expectTypeOf(EJSONNs.clone<string>("s")).toBeString();

expectTypeOf(EJSONNs.equals).parameters.toEqualTypeOf<
  [EJSON, EJSON, { keyOrderSensitive?: boolean | undefined }?]
>();
expectTypeOf(EJSONNs.equals).returns.toBeBoolean();

expectTypeOf(EJSONNs.fromJSONValue).parameters.toEqualTypeOf<[JSONable]>();
expectTypeOf(EJSONNs.fromJSONValue).returns.toEqualTypeOf<EJSONableProperty>();

expectTypeOf(EJSONNs.isBinary).parameters.toEqualTypeOf<[object]>();
expectTypeOf(EJSONNs.newBinary).parameters.toEqualTypeOf<[number]>();
expectTypeOf(EJSONNs.newBinary).returns.toEqualTypeOf<Uint8Array>();

expectTypeOf(EJSONNs.parse).parameters.toEqualTypeOf<[string]>();
expectTypeOf(EJSONNs.parse).returns.toEqualTypeOf<EJSON>();

expectTypeOf(EJSONNs.stringify).parameters.toEqualTypeOf<
  [EJSON, { indent?: boolean | number | string | undefined; canonical?: boolean | undefined }?]
>();
expectTypeOf(EJSONNs.stringify).returns.toBeString();

expectTypeOf(EJSONNs.toJSONValue).parameters.toEqualTypeOf<[EJSON]>();
expectTypeOf(EJSONNs.toJSONValue).returns.toEqualTypeOf<JSONable>();
