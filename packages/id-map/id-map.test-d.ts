import { expectTypeOf } from "expect-type";
import { IdMap } from "./id-map";

expectTypeOf<typeof IdMap>().toBeConstructibleWith();
expectTypeOf<typeof IdMap>().toBeConstructibleWith(
  (id: unknown) => String(id),
  (str: string) => str
);

const map = new IdMap<string, number>();
expectTypeOf(map).toEqualTypeOf<IdMap<string, number>>();

expectTypeOf(map.get).parameters.toEqualTypeOf<[string]>();
expectTypeOf(map.get).returns.toEqualTypeOf<number | undefined>();

expectTypeOf(map.set).parameters.toEqualTypeOf<[string, number]>();
expectTypeOf(map.set).returns.toBeVoid();

expectTypeOf(map.remove).parameters.toEqualTypeOf<[string]>();
expectTypeOf(map.remove).returns.toBeVoid();

expectTypeOf(map.has).parameters.toEqualTypeOf<[string]>();
expectTypeOf(map.has).returns.toBeBoolean();

expectTypeOf(map.empty).returns.toBeBoolean();
expectTypeOf(map.clear).returns.toBeVoid();

expectTypeOf(map.forEach).parameters.toEqualTypeOf<
  [(value: number, id: string) => boolean | void]
>();
expectTypeOf(map.forEach).returns.toBeVoid();

expectTypeOf(map.forEachAsync).parameters.toEqualTypeOf<
  [(value: number, id: string) => Promise<boolean | void> | boolean | void]
>();
expectTypeOf(map.forEachAsync).returns.resolves.toBeVoid();

expectTypeOf(map.size).returns.toBeNumber();

expectTypeOf(map.setDefault).parameters.toEqualTypeOf<[string, number]>();
expectTypeOf(map.setDefault).returns.toBeNumber();

expectTypeOf(map.clone).returns.toEqualTypeOf<IdMap<string, number>>();
