import { expectTypeOf } from "expect-type";
import type {
  EJSON,
  EJSONable,
  EJSONableCustomType,
  EJSONableProperty,
  JSONable,
} from "./ejson";

// EJSONableCustomType — shape of a registered custom type
declare const customType: EJSONableCustomType;
expectTypeOf(customType).toMatchTypeOf<{ toJSONValue(): JSONable; typeName(): string }>();
expectTypeOf(customType.toJSONValue()).toEqualTypeOf<JSONable>();
expectTypeOf(customType.typeName()).toBeString();
expectTypeOf(customType.clone).toEqualTypeOf<(() => EJSONableCustomType) | undefined>();
expectTypeOf(customType.equals).toEqualTypeOf<((other: Object) => boolean) | undefined>();

// EJSONableProperty — union of allowed property values
expectTypeOf<number>().toMatchTypeOf<EJSONableProperty>();
expectTypeOf<string>().toMatchTypeOf<EJSONableProperty>();
expectTypeOf<Date>().toMatchTypeOf<EJSONableProperty>();
expectTypeOf<Uint8Array>().toMatchTypeOf<EJSONableProperty>();
expectTypeOf<null>().toMatchTypeOf<EJSONableProperty>();
expectTypeOf<undefined>().toMatchTypeOf<EJSONableProperty>();

// EJSONable — index signature over EJSONableProperty
declare const bag: EJSONable;
expectTypeOf(bag).toMatchTypeOf<{ [k: string]: EJSONableProperty }>();
expectTypeOf(bag["anyKey"]).toEqualTypeOf<EJSONableProperty>();

// JSONable — like EJSONable but without Date/Uint8Array/custom types
declare const jsonBag: JSONable;
expectTypeOf(jsonBag["x"]).toEqualTypeOf<
  | number
  | string
  | boolean
  | Object
  | number[]
  | string[]
  | Object[]
  | undefined
  | null
>();

// EJSON — extends EJSONable plus namespace of functions
declare const e: EJSON;
expectTypeOf(e).toMatchTypeOf<EJSONable>();

expectTypeOf(EJSON.parse).toEqualTypeOf<(str: string) => EJSON>();
expectTypeOf(EJSON.stringify).parameters.toMatchTypeOf<
  [
    EJSON,
    (
      | {
          indent?: boolean | number | string | undefined;
          canonical?: boolean | undefined;
        }
      | undefined
    )?
  ]
>();
expectTypeOf(EJSON.stringify).returns.toBeString();

expectTypeOf(EJSON.clone).toBeFunction();
expectTypeOf(EJSON.clone<{ a: 1 }>).returns.toEqualTypeOf<{ a: 1 }>();

expectTypeOf(EJSON.equals).parameters.toMatchTypeOf<
  [EJSON, EJSON, { keyOrderSensitive?: boolean | undefined }?]
>();
expectTypeOf(EJSON.equals).returns.toBeBoolean();

expectTypeOf(EJSON.isBinary).guards.toEqualTypeOf<Uint8Array>();
expectTypeOf(EJSON.newBinary).toEqualTypeOf<(size: number) => Uint8Array>();

expectTypeOf(EJSON.addType).parameters.toMatchTypeOf<
  [string, (val: JSONable) => EJSONableCustomType]
>();
expectTypeOf(EJSON.addType).returns.toBeVoid();

expectTypeOf(EJSON.toJSONValue).toEqualTypeOf<(val: EJSON) => JSONable>();
expectTypeOf(EJSON.fromJSONValue).parameters.toMatchTypeOf<[JSONable]>();
