import { expectTypeOf } from "expect-type";
import { Base64 } from "./base64";

expectTypeOf(Base64).toHaveProperty("encode");
expectTypeOf(Base64.encode).parameters.toEqualTypeOf<[Uint8Array | string]>();
expectTypeOf(Base64.encode).returns.toBeString();

expectTypeOf(Base64.decode).parameters.toEqualTypeOf<[string]>();
expectTypeOf(Base64.decode).returns.toEqualTypeOf<Uint8Array>();

expectTypeOf(Base64.newBinary).parameters.toEqualTypeOf<[number]>();
expectTypeOf(Base64.newBinary).returns.toEqualTypeOf<Uint8Array>();
